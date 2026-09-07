import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  History,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import Auth from "./Auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type FileValue = File | null;
type User = { id: number; name: string; email: string };
type HistoryItem = { id: number; answer: string; created_at: string };

const PRESETS = [
  { id: "direct", label: "Short & Direct", prompt: "Listen to the spoken question and answer it based on the image. Give a short, simple answer." },
  { id: "detailed", label: "Detailed Analysis", prompt: "Listen carefully to the spoken question and provide a detailed, insightful analysis based on what is visible in the image." },
  { id: "structured", label: "Key Points", prompt: "Listen to the question and provide a concise, structured bullet-point response based on the image." },
];

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("multimodel_token") || "");
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("multimodel_user");
    return stored ? JSON.parse(stored) : null;
  });

  // Media inputs
  const [image, setImage] = useState<FileValue>(null);
  const [audio, setAudio] = useState<FileValue>(null);
  const [preview, setPreview] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("direct");
  const [customInstruction, setCustomInstruction] = useState(PRESETS[0].prompt);

  // Analysis result
  const [answer, setAnswer] = useState("");
  const [answerAudio, setAnswerAudio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<number | null>(null);

  // Custom Audio Player state
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // History Drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Image preview lifecycle
  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Recording duration timer
  useEffect(() => {
    if (recording) {
      setRecordingDuration(0);
      recordingTimer.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
    }
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, [recording]);

  // Load history when drawer opens
  useEffect(() => {
    if (historyOpen && token) {
      fetchHistory();
    }
  }, [historyOpen, token]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setHistoryList(data.history || []);
      }
    } catch {
      // Ignore background history fetch errors
    } finally {
      setHistoryLoading(false);
    }
  };

  const pick = (kind: "image" | "audio") => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (kind === "image") setImage(file);
    else setAudio(file);
    setError("");
  };

  const drop = (kind: "image" | "audio") => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0] ?? null;
    if (!file) return;
    if (kind === "image" && file.type.startsWith("image/")) {
      setImage(file);
      setError("");
    } else if (kind === "audio" && (file.type.startsWith("audio/") || file.name.endsWith(".webm") || file.name.endsWith(".wav") || file.name.endsWith(".mp3"))) {
      setAudio(file);
      setError("");
    }
  };

  const toggleRecording = async () => {
    if (recording && recorder.current) {
      recorder.current.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser does not support audio recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recordingChunks.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunks.current, { type: mimeType });
        setAudio(new File([blob], "voice-question.webm", { type: mimeType }));
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };

      recorder.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setError("");
    } catch {
      setError("Microphone access was denied. Please check your browser permissions.");
    }
  };

  const analyze = async () => {
    if (!image || !audio) {
      setError("Please provide both an image and a voice audio question first.");
      return;
    }
    setBusy(true);
    setError("");
    setAnswer("");
    setAnswerAudio("");
    setIsPlaying(false);

    const form = new FormData();
    form.append("image", image);
    form.append("audio", audio);
    form.append("instruction", customInstruction);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Analysis request failed.");
      setAnswer(data.answer);
      if (data.audio) {
        setAnswerAudio(`data:audio/mpeg;base64,${data.audio}`);
      } else if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(data.answer));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Multimodal analysis failed. Check server logs.");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setImage(null);
    setAudio(null);
    setAnswer("");
    setAnswerAudio("");
    setError("");
    setIsPlaying(false);
  };

  // Audio player helpers
  const togglePlayAudio = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioPlayerRef.current || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audioPlayerRef.current.currentTime = percent * duration;
    setCurrentTime(percent * duration);
  };

  const cycleSpeed = () => {
    if (!audioPlayerRef.current) return;
    const rates = [1, 1.25, 1.5];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    audioPlayerRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const copyTranscript = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const authenticate = (newToken: string, newUser: User) => {
    localStorage.setItem("multimodel_token", newToken);
    localStorage.setItem("multimodel_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("multimodel_token");
    localStorage.removeItem("multimodel_user");
    setToken("");
    setUser(null);
  };

  if (!token || !user) {
    return <Auth onAuthenticated={authenticate} />;
  }

  return (
    <div className="studio-shell">
      {/* Hidden Audio element for custom player */}
      {answerAudio && (
        <audio
          ref={audioPlayerRef}
          src={answerAudio}
          onTimeUpdate={() => setCurrentTime(audioPlayerRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(audioPlayerRef.current?.duration || 0)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Top Studio Navbar */}
      <header className="studio-nav">
        <div className="brand-container">
          <div className="brand-badge">
            <Wand2 size={20} />
          </div>
          <div className="brand-title">
            Multimodel <span className="brand-version">v3 Flash Preview</span>
          </div>
        </div>

        <div className="nav-controls">
          <div className="status-pill">
            <span className="status-dot" />
            <span>Gemini Multimodal Active</span>
          </div>

          <button
            className="btn-icon"
            onClick={() => setHistoryOpen(true)}
            title="Analysis History"
          >
            <History size={18} />
          </button>

          <div className="user-profile">
            <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <span className="user-name">{user.name}</span>
            <button className="btn-icon btn-logout" onClick={logout} title="Sign Out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Studio Hero Section */}
      <section className="studio-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <Sparkles size={13} />
            <span>Multimodal Intelligence Studio</span>
          </div>
          <h1 className="hero-title">
            See the scene. <span>Hear the answer.</span>
          </h1>
          <p className="hero-description">
            Feed Gemini an image and ask any question by voice. Receive instant visual reasoning delivered back in natural synthesized speech.
          </p>
        </div>

        <div className="hero-badges">
          <div className="capability-badge">
            <Check size={12} style={{ color: "var(--accent-success)" }} />
            <span>Gemini 3 Flash Preview</span>
          </div>
          <div className="capability-badge">
            <Check size={12} style={{ color: "var(--accent-success)" }} />
            <span>Neural Speech Synthesizer</span>
          </div>
          <div className="capability-badge">
            <Check size={12} style={{ color: "var(--accent-success)" }} />
            <span>Isolated SQLite Sessions</span>
          </div>
        </div>
      </section>

      {/* Main Studio Workspace Grid */}
      <main className="studio-workspace">
        {/* Left Column: Multimodal Inputs Studio */}
        <section className="studio-panel">
          <div className="panel-header">
            <div className="panel-step">
              <span className="step-num">01</span>
              <h2 className="panel-title">Feed the Model</h2>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              Vision + Voice
            </span>
          </div>

          {/* Dual Input Cards */}
          <div className="inputs-grid">
            {/* Image Dropzone */}
            <div
              className={`input-card ${image ? "has-file" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={drop("image")}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pick("image")}
                title="Upload image"
              />

              {preview ? (
                <div className="image-preview-container">
                  <img src={preview} alt="Uploaded scene" className="image-preview-img" />
                  <div className="image-preview-overlay">
                    <span className="badge-ready">
                      <Check size={12} /> Image Ready
                    </span>
                    <div className="image-meta">
                      <span className="file-name-chip" title={image?.name}>
                        {image?.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImage(null);
                        }}
                        style={{
                          background: "rgba(0,0,0,0.6)",
                          border: "none",
                          color: "#f87171",
                          padding: 4,
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                        title="Remove image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card-icon-bubble">
                    <ImageIcon size={24} />
                  </div>
                  <div className="card-label">Drop scene image</div>
                  <div className="card-hint">JPG, PNG, or WebP</div>
                </>
              )}
            </div>

            {/* Audio Dropzone / Indicator */}
            <div
              className={`input-card ${audio ? "has-file" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={drop("audio")}
            >
              <input
                type="file"
                accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/webm"
                onChange={pick("audio")}
                title="Upload audio question"
              />

              {audio ? (
                <div style={{ textAlign: "center", zIndex: 2 }}>
                  <div
                    className="card-icon-bubble"
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      borderColor: "rgba(16, 185, 129, 0.3)",
                      color: "var(--accent-success)",
                    }}
                  >
                    <Check size={24} />
                  </div>
                  <span className="badge-ready" style={{ margin: "0 auto 8px" }}>
                    Audio Ready
                  </span>
                  <div className="card-label" style={{ fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {audio.name}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudio(null);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#f87171",
                      fontSize: 11,
                      cursor: "pointer",
                      marginTop: 4,
                    }}
                  >
                    Remove audio
                  </button>
                </div>
              ) : (
                <>
                  <div className="card-icon-bubble">
                    <Upload size={24} />
                  </div>
                  <div className="card-label">Drop audio file</div>
                  <div className="card-hint">MP3, WAV, WebM</div>
                </>
              )}
            </div>
          </div>

          {/* Microphone Live Recording Button */}
          <div className="audio-action-row">
            <button
              type="button"
              onClick={toggleRecording}
              className={`btn-record-large ${recording ? "active-recording" : ""}`}
            >
              {recording ? (
                <>
                  <span className="recording-beacon" />
                  <span>Recording in progress... Tap to Finish</span>
                  <span className="recording-timer">{formatTime(recordingDuration)}</span>
                </>
              ) : (
                <>
                  <Mic size={18} style={{ color: "var(--accent-primary)" }} />
                  <span>Record question with Microphone</span>
                </>
              )}
            </button>
          </div>

          {/* Instruction Presets */}
          <div className="presets-container">
            <div className="presets-label">
              <Sparkles size={12} />
              <span>Prompt Instruction Strategy</span>
            </div>
            <div className="preset-pills">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-pill ${selectedPreset === preset.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setCustomInstruction(preset.prompt);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="action-row">
            <button
              type="button"
              className="btn-primary-action"
              onClick={analyze}
              disabled={busy || recording || !image || !audio}
            >
              {busy ? (
                <>
                  <Loader2 className="spin" size={18} />
                  <span>Reasoning across vision & voice...</span>
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  <span>Run Multimodal Analysis</span>
                </>
              )}
            </button>

            <button type="button" className="btn-secondary-action" onClick={resetAll} title="Reset all inputs">
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>

          {error && (
            <div className="error-banner">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Right Column: Output & Audio Player */}
        <section className="studio-panel">
          <div className="panel-header">
            <div className="panel-step">
              <span className="step-num" style={{ background: "var(--accent-secondary)" }}>02</span>
              <h2 className="panel-title">Multimodal Synthesis</h2>
            </div>
            {answer && (
              <span className="model-tag">
                <Sparkles size={11} />
                Gemini 3 Flash Preview
              </span>
            )}
          </div>

          <div className="output-content">
            {answer ? (
              <div className="answer-box">
                <div className="answer-top-bar">
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    Spoken Transcript
                  </span>
                  <button
                    className="btn-icon"
                    onClick={copyTranscript}
                    title="Copy response to clipboard"
                    style={{ fontSize: 12, gap: 5 }}
                  >
                    {copied ? <Check size={14} style={{ color: "var(--accent-success)" }} /> : <Copy size={14} />}
                    <span style={{ fontSize: 11 }}>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="answer-text-container">
                  <p className="answer-text">{answer}</p>
                </div>

                {/* Custom Audiophile Player */}
                {answerAudio && (
                  <div className="audio-player-card">
                    <div className="player-info">
                      <div className="player-title-row">
                        <Volume2 size={16} style={{ color: "var(--accent-primary)" }} />
                        <span>Synthesized Voice Output</span>
                      </div>
                      <span className="player-voice-badge">Neural TTS</span>
                    </div>

                    <div className="player-controls">
                      <button
                        type="button"
                        className="btn-play-pause"
                        onClick={togglePlayAudio}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
                      </button>

                      <div className="player-progress-area">
                        <div className="progress-track" onClick={handleSeek}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="time-row">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="speed-badge"
                        onClick={cycleSpeed}
                        title="Change playback speed"
                      >
                        {playbackRate}x
                      </button>

                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => {
                          if (!audioPlayerRef.current) return;
                          audioPlayerRef.current.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }}
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>

                      <a
                        href={answerAudio}
                        download="gemini-answer.mp3"
                        className="btn-icon"
                        title="Download audio file"
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon-orbit">
                  <Wand2 size={32} />
                </div>
                <h3 className="empty-title">Awaiting Multimodal Inputs</h3>
                <p className="empty-subtitle">
                  Provide an image and speak your inquiry on the left. Gemini will fuse both inputs to synthesize a spoken and written answer.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Studio Footer */}
      <footer className="studio-footer">
        <div className="footer-credits">
          Multimodel Studio • Powered by <span>Gemini 3 Flash Preview</span> & <span>gTTS</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span>SQLite Isolated Storage</span>
          <span>FastAPI Engine</span>
        </div>
      </footer>

      {/* History Slide-out Drawer */}
      {historyOpen && (
        <div className="history-drawer-overlay" onClick={() => setHistoryOpen(false)}>
          <aside className="history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">
                <History size={18} style={{ color: "var(--accent-primary)" }} />
                <span>Recent Analyses</span>
              </div>
              <button
                className="btn-icon"
                onClick={() => setHistoryOpen(false)}
                title="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {historyLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-secondary)" }}>
                <Loader2 className="spin" size={20} />
                <span style={{ marginLeft: 8, fontSize: 13 }}>Loading history...</span>
              </div>
            ) : historyList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-tertiary)", fontSize: 13 }}>
                No previous analyses found yet. Run an analysis to build your session history.
              </div>
            ) : (
              <div className="history-list">
                {historyList.map((item) => (
                  <div
                    key={item.id}
                    className="history-card"
                    onClick={() => {
                      setAnswer(item.answer);
                      setAnswerAudio("");
                      setHistoryOpen(false);
                    }}
                  >
                    <div className="history-timestamp">
                      <Clock size={10} style={{ display: "inline", marginRight: 4 }} />
                      {item.created_at}
                    </div>
                    <div className="history-snippet">{item.answer}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: 3 }}>
                      <span>View answer</span>
                      <ChevronRight size={12} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
