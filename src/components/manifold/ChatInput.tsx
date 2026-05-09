import { useState, type FormEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  isThinking: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isThinking }: ChatInputProps) {
  const [flash, setFlash] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`manifold-fade-in manifold-delay-3 ${flash ? "manifold-flash" : ""}`}
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 600,
        maxWidth: "calc(100vw - 48px)",
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: "rgba(0, 8, 14, 0.92)",
        border: "1px solid var(--manifold-panel-border)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 12px rgba(0,255,255,0.15)",
      }}
    >
      <span className={`manifold-pulse-dot ${isThinking ? "thinking" : ""}`} aria-hidden="true" />
      <input
        type="text"
        className="manifold-input"
        placeholder={isThinking ? "thinking..." : "Describe what you want to see..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isThinking}
        style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: "none", boxShadow: "none", background: "transparent" }}
      />
      <button type="submit" className="manifold-send-btn" disabled={isThinking || !value.trim()} aria-label="Send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
