import { useState, type FormEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  isThinking: boolean;
}

const CHIPS = [
  { label: "L2 Halo family",          color: "#AADDFF" },
  { label: "L1 Lyapunov family",       color: "#00FFFF" },
  { label: "Butterfly orbits",         color: "#FF6B35" },
  { label: "L2 halo manifolds",        color: "#AADDFF" },
  { label: "DRO family",               color: "#FFD700" },
  { label: "L2 halo → Moon transfer",  color: "#88BBFF" },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ChatInput({ value, onChange, onSubmit, isThinking }: ChatInputProps) {
  const [flash, setFlash] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    onSubmit(trimmed);
  };

  const handleChip = (label: string) => {
    if (isThinking) return;
    onSubmit(label);
  };

  return (
    <div
      className="manifold-fade-in manifold-delay-3"
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 640,
        maxWidth: "calc(100vw - 48px)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Quick-prompt chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleChip(chip.label)}
            disabled={isThinking}
            onMouseEnter={() => setHovered(chip.label)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hexToRgba(chip.color, hovered === chip.label ? 0.5 : 0.25),
              border: `1px solid ${hexToRgba(chip.color, 0.5)}`,
              color: "#ffffff",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              cursor: isThinking ? "default" : "pointer",
              opacity: isThinking ? 0.5 : 1,
              transition: "background 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Main input form */}
      <form
        onSubmit={handleSubmit}
        className={flash ? "manifold-flash" : ""}
        style={{
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
    </div>
  );
}
