import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, User as UserIcon, Wand2 } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type User = { id: number; name: string; email: string };
type Props = { onAuthenticated: (token: string, user: User) => void };

export default function Auth({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData();
    form.append("email", email);
    form.append("password", password);
    if (mode === "signup") {
      form.append("name", name);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/${mode}`, {
        method: "POST",
        body: form,
      });
      const body = await response.text();
      let data: { detail?: string; token?: string; user?: User } = {};
      try {
        data = body ? JSON.parse(body) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        throw new Error(data.detail || `Backend returned HTTP ${response.status}. Make sure the FastAPI server is running.`);
      }
      if (!data.token || !data.user) {
        throw new Error("Authentication response was incomplete.");
      }
      onAuthenticated(data.token, data.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to authenticate.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={containerStyle}>
      {/* Ambient background glow orbs */}
      <div style={glowOrbTopLeft} />
      <div style={glowOrbBottomRight} />

      <main style={cardStyle}>
        {/* Header Branding */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={brandBadgeStyle}>
              <Wand2 size={18} />
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "#f8fafc", letterSpacing: "-0.01em" }}>
                Multimodel <span style={{ color: "var(--accent-primary)", fontSize: 12 }}>Studio</span>
              </div>
            </div>
          </div>
          <div style={studioBadgeStyle}>
            <Sparkles size={12} />
            <span>AI Studio</span>
          </div>
        </div>

        {/* Title and Intro */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", marginBottom: 6 }}>
            {mode === "login" ? "Welcome back" : "Create your studio"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {mode === "login"
              ? "Sign in to access your multimodal vision and voice workspace."
              : "Sign up to begin multimodal exploration with Gemini intelligence."}
          </p>
        </div>

        {/* Mode Switcher Segmented Control */}
        <div style={segmentedControlStyle}>
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            style={{
              ...segmentButtonStyle,
              ...(mode === "login" ? activeSegmentStyle : {}),
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            style={{
              ...segmentButtonStyle,
              ...(mode === "signup" ? activeSegmentStyle : {}),
            }}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "signup" && (
            <div>
              <label style={fieldLabelStyle}>Full Name</label>
              <div className="auth-input-wrapper">
                <UserIcon size={16} className="auth-input-icon" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  required
                  minLength={2}
                  className="auth-input"
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div>
            <label style={fieldLabelStyle}>Email Address</label>
            <div className="auth-input-wrapper">
              <Mail size={16} className="auth-input-icon" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
                required
                className="auth-input"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>Password</label>
            <div className="auth-input-wrapper">
              <Lock size={16} className="auth-input-icon" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                className="auth-input"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-eye-btn"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={errorStyle}>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              ...submitButtonStyle,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{mode === "login" ? "Enter Studio" : "Create Account"}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security Footer Note */}
        <div style={securityNoteStyle}>
          <ShieldCheck size={14} style={{ color: "var(--accent-success)" }} />
          <span>Encrypted sessions with isolated user history in SQLite</span>
        </div>
      </main>
    </div>
  );
}

// Inline styles for high-fidelity component
const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  position: "relative",
  overflow: "hidden",
};

const glowOrbTopLeft: React.CSSProperties = {
  position: "absolute",
  top: "10%",
  left: "25%",
  width: "380px",
  height: "380px",
  background: "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)",
  pointerEvents: "none",
};

const glowOrbBottomRight: React.CSSProperties = {
  position: "absolute",
  bottom: "10%",
  right: "25%",
  width: "420px",
  height: "420px",
  background: "radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)",
  pointerEvents: "none",
};

const cardStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  background: "rgba(16, 22, 36, 0.8)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "24px",
  padding: "36px 32px",
  boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255, 255, 255, 0.06)",
  zIndex: 10,
};

const brandBadgeStyle: React.CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: "var(--gradient-brand)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ffffff",
  boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)",
};

const studioBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  fontSize: "11px",
  fontWeight: 600,
  fontFamily: "var(--font-mono)",
  color: "var(--accent-primary)",
  background: "rgba(99, 102, 241, 0.1)",
  border: "1px solid rgba(99, 102, 241, 0.25)",
  padding: "4px 10px",
  borderRadius: "9999px",
};

const segmentedControlStyle: React.CSSProperties = {
  display: "flex",
  background: "rgba(8, 12, 20, 0.7)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: "12px",
  padding: "4px",
  marginBottom: "24px",
};

const segmentButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: "var(--font-sans)",
  background: "transparent",
  border: "none",
  color: "var(--text-secondary)",
  borderRadius: "9px",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const activeSegmentStyle: React.CSSProperties = {
  background: "rgba(99, 102, 241, 0.2)",
  color: "#ffffff",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "7px",
};



const errorStyle: React.CSSProperties = {
  padding: "10px 14px",
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  borderRadius: "10px",
  color: "#fca5a5",
  fontSize: "12px",
};

const submitButtonStyle: React.CSSProperties = {
  height: "48px",
  background: "var(--gradient-btn)",
  border: "none",
  borderRadius: "12px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  marginTop: "8px",
  boxShadow: "0 4px 20px -2px rgba(99, 102, 241, 0.5)",
  transition: "all 0.2s ease",
};

const securityNoteStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  marginTop: "24px",
  paddingTop: "20px",
  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
  fontSize: "11px",
  color: "var(--text-tertiary)",
  textAlign: "center",
};
