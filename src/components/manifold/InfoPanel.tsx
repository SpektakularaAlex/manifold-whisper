import type { CRSystem, SearchEntry } from "@/data/systems"

interface InfoPanelProps {
  explanation?: string;
  suggestedNext?: string;
  isThinking?: boolean;
  onSuggestionClick?: (s: string) => void;
  systemInfo?: CRSystem | null;
  conceptContent?: SearchEntry | null;
}

const THINKING_STATES = [
  "Computing trajectory...",
  "Propagating orbit...",
  "Rendering manifolds...",
];

import { useEffect, useState } from "react";

export function InfoPanel({ explanation, suggestedNext, isThinking, onSuggestionClick, systemInfo, conceptContent }: InfoPanelProps) {
  const [thinkingIdx, setThinkingIdx] = useState(0);

  useEffect(() => {
    if (!isThinking) return;
    const id = setInterval(() => setThinkingIdx((i) => (i + 1) % THINKING_STATES.length), 800);
    return () => clearInterval(id);
  }, [isThinking]);

  return (
    <aside
      className="manifold-panel manifold-fade-in manifold-delay-1"
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        width: 320,
        maxHeight: "calc(100vh - 48px)",
        padding: "20px 22px",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflowY: "auto",
      }}
    >
      <div>
        <div
          className="manifold-mono"
          style={{ color: "var(--manifold-cyan)", fontSize: 14, letterSpacing: "0.4em", fontWeight: 700 }}
        >
          MANIFOLD
        </div>
        <div style={{ color: "var(--manifold-text-faint)", fontSize: 10, letterSpacing: "0.15em", marginTop: 4, textTransform: "uppercase" }}>
          Cislunar Dynamics Explorer
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(0,255,255,0.2)" }} />

      <div style={{ minHeight: 80, fontSize: 13, lineHeight: 1.55, color: "#cfe3f0" }}>
        {conceptContent ? (
          <div>
            <div style={{ color: "var(--manifold-cyan)", fontWeight: 700, marginBottom: 6, fontSize: 12, letterSpacing: "0.08em" }}>
              {conceptContent.label}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.55, color: "#cfe3f0" }}>{conceptContent.description}</div>
          </div>
        ) : isThinking ? (
          <span className="manifold-mono" style={{ color: "var(--manifold-cyan)", fontStyle: "italic", opacity: 0.85 }}>
            {THINKING_STATES[thinkingIdx]}
          </span>
        ) : explanation ? (
          <span>{explanation}</span>
        ) : systemInfo ? (
          <div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "#cfe3f0", marginBottom: 10 }}>{systemInfo.description}</div>
            <div className="manifold-mono" style={{ fontSize: 9, letterSpacing: "0.15em", color: "var(--manifold-orange)", marginBottom: 4, textTransform: "uppercase" }}>Fun Fact</div>
            <div style={{ fontSize: 11, color: "#aabbd0", fontStyle: "italic", lineHeight: 1.4, marginBottom: 10 }}>{systemInfo.funFact}</div>
            <div className="manifold-mono" style={{ fontSize: 9, letterSpacing: "0.15em", color: "var(--manifold-orange)", marginBottom: 6, textTransform: "uppercase" }}>Real Missions</div>
            {systemInfo.realMissions.map((m, i) => (
              <div key={i} style={{ fontSize: 10, color: "#7090a0", marginBottom: 3 }}>· {m}</div>
            ))}
          </div>
        ) : (
          <span
            className="manifold-mono"
            style={{ color: "var(--manifold-text-faint)", fontStyle: "italic", fontSize: 12 }}
          >
            Initialise a query to explore cislunar space.
          </span>
        )}
      </div>

      {suggestedNext && !isThinking && !conceptContent && !systemInfo && (
        <div style={{ marginTop: 4 }}>
          <div
            className="manifold-mono"
            style={{ fontSize: 9, letterSpacing: "0.2em", color: "var(--manifold-orange)", marginBottom: 6, textTransform: "uppercase" }}
          >
            → try:
          </div>
          <button className="manifold-suggestion" onClick={() => onSuggestionClick?.(suggestedNext)}>
            <span className="arrow">→</span>
            <span>{suggestedNext}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
