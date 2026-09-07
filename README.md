# Multimodel

Upload an image and a spoken question. Gemini answers the question using the image, and the app returns the answer as generated voice with a text transcript. Accounts keep each user's analysis history isolated in SQLite.

## Setup

1. Copy `.env.example` to `.env` and set `GOOGLE_API_KEY` and a long random `TOKEN_SECRET`.
2. Install Python dependencies: `python -m venv .venv`, `.venv\\Scripts\\Activate.ps1`, then `pip install -r backend\\requirements.txt`.
3. Install frontend dependencies: `cd frontend` then `npm install`.

For local frontend development, copy `frontend\.env.example` to `frontend\.env`.
For deployment, set `VITE_API_BASE_URL` to the deployed backend URL in the frontend service environment. Set `FRONTEND_ORIGINS` on the backend to the deployed frontend URL. `GEMINI_MODEL` defaults to `gemini-3-flash-preview` and can be changed in the backend environment if needed.

## Run

Terminal 1: activate the environment with `.venv\\Scripts\\Activate.ps1`, then run `python -m uvicorn backend.main:app --reload --port 8000`

Terminal 2: `cd frontend` then `npm run dev`

Open the Vite URL, create an account, and sign in. The Gemini key stays on the backend. gTTS needs network access to create the spoken response. The backend must allow the deployed frontend origin in CORS. The local `multimodel.db` file is excluded from version control.
