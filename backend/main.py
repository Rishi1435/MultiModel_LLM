import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import subprocess
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from gtts import gTTS
import imageio_ffmpeg

load_dotenv()
app = FastAPI(title="Multimodel API")
frontend_origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,*").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=frontend_origins, allow_methods=["*"], allow_headers=["*"])

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/webm", "video/webm"}
DEFAULT_PROMPT = "Listen to the spoken question and answer it based on the image. Give a short, simple answer."
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "multimodel.db"))
TOKEN_SECRET = os.getenv("TOKEN_SECRET", "local-development-secret-change-me")


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_db() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                answer TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON analyses(user_id);
        """)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt_hex, digest_hex = stored_hash.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 310_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_token(user_id: int) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + (60 * 60 * 24 * 7)}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(TOKEN_SECRET.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def current_user(authorization: str | None) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in to continue.")
    try:
        encoded, signature = authorization.removeprefix("Bearer ").split(".", 1)
        expected = hmac.new(TOKEN_SECRET.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if payload["exp"] < time.time():
            raise ValueError
        user_id = int(payload["sub"])
    except (ValueError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(401, "Your session is invalid or expired.") from None
    with get_db() as connection:
        user = connection.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(401, "Your account no longer exists.")
    return user


def wait_for_file_ready(client: genai.Client, file_name: str):
    for _ in range(30):
        uploaded_file = client.files.get(name=file_name)
        state = uploaded_file.state
        if state == genai.types.FileState.ACTIVE:
            return uploaded_file
        if state == genai.types.FileState.FAILED:
            detail = uploaded_file.error.message if uploaded_file.error else "Gemini could not process the audio file."
            raise RuntimeError(detail)
        time.sleep(1)
    raise RuntimeError("Gemini took too long to process the audio file. Please try again.")


def convert_webm_to_wav(source_path: str) -> str:
    converted = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    converted.close()
    subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", source_path,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", converted.name,
    ], check=True, capture_output=True)
    return converted.name


def generate_with_retry(client: genai.Client, contents: list[object]):
    for attempt in range(3):
        try:
            return client.models.generate_content(model=GEMINI_MODEL, contents=contents)
        except Exception as error:
            message = str(error)
            is_temporary = "503" in message or "UNAVAILABLE" in message
            if not is_temporary or attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))


initialize_database()

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/signup")
def signup(name: str = Form(...), email: str = Form(...), password: str = Form(...)) -> dict[str, object]:
    name, email = name.strip(), email.strip().lower()
    if len(name) < 2 or "@" not in email or len(password) < 8:
        raise HTTPException(400, "Use a name, valid email, and password with at least 8 characters.")
    try:
        with get_db() as connection:
            cursor = connection.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", (name, email, hash_password(password)))
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with that email already exists.") from None
    return {"token": create_token(user_id), "user": {"id": user_id, "name": name, "email": email}}


@app.post("/api/auth/login")
def login(email: str = Form(...), password: str = Form(...)) -> dict[str, object]:
    with get_db() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email.strip(),)).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"token": create_token(user["id"]), "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}


@app.get("/api/auth/me")
def me(authorization: str | None = Header(None)) -> dict[str, object]:
    user = current_user(authorization)
    return {"user": dict(user)}


@app.get("/api/history")
def history(authorization: str | None = Header(None)) -> dict[str, list[dict[str, object]]]:
    user = current_user(authorization)
    with get_db() as connection:
        rows = connection.execute("SELECT id, answer, created_at FROM analyses WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    return {"history": [dict(row) for row in rows]}

@app.post("/api/analyze")
async def analyze(image: UploadFile = File(...), audio: UploadFile = File(...), instruction: str = Form(DEFAULT_PROMPT), authorization: str | None = Header(None)) -> dict[str, str]:
    user = current_user(authorization)
    if image.content_type not in IMAGE_TYPES:
        raise HTTPException(400, "Please upload a JPG, PNG, or WebP image.")
    audio_type = (audio.content_type or "").split(";", 1)[0].lower()
    if audio_type not in AUDIO_TYPES:
        raise HTTPException(400, "Please upload a WAV, MP3, M4A, or WebM audio file.")
    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(500, "GOOGLE_API_KEY is not configured on the server.")

    image_bytes, audio_bytes = await image.read(), await audio.read()
    audio_path = converted_audio_path = output_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(audio.filename or "question.mp3").suffix or ".mp3") as temp:
            temp.write(audio_bytes)
            audio_path = temp.name
        upload_path = audio_path
        if audio_type in {"audio/webm", "video/webm"}:
            converted_audio_path = convert_webm_to_wav(audio_path)
            upload_path = converted_audio_path
        client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
        uploaded_audio = client.files.upload(file=upload_path)
        if not uploaded_audio.name:
            raise RuntimeError("Gemini did not return an uploaded audio file name.")
        uploaded_audio = wait_for_file_ready(client, uploaded_audio.name)
        response = generate_with_retry(client, [
            {"inline_data": {"mime_type": image.content_type, "data": base64.b64encode(image_bytes).decode("ascii")}},
            uploaded_audio,
            instruction,
        ])
        answer = (response.text or "").strip()
        if not answer:
            raise HTTPException(502, "Gemini returned an empty answer.")
        generated_audio = ""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp:
                output_path = temp.name
            gTTS(text=answer, lang="en").save(output_path)
            generated_audio = base64.b64encode(Path(output_path).read_bytes()).decode("ascii")
        except Exception:
            if output_path:
                Path(output_path).unlink(missing_ok=True)
            output_path = None
        with get_db() as connection:
            connection.execute("INSERT INTO analyses (user_id, answer) VALUES (?, ?)", (user["id"], answer))
        return {"answer": answer, "audio": generated_audio}
    except HTTPException:
        raise
    except Exception as error:
        message = str(error)
        if "503" in message or "UNAVAILABLE" in message:
            raise HTTPException(503, "Gemini is temporarily busy. Please wait a moment and try again.") from error
        raise HTTPException(502, f"Multimodal processing failed: {error}") from error
    finally:
        for path in (audio_path, converted_audio_path, output_path):
            if path:
                Path(path).unlink(missing_ok=True)
