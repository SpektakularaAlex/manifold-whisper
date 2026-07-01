import { useEffect, useMemo, useState } from "react";
import type { SearchEntry } from "@/data/systems";
import {
  contentForSelection,
  EDUCATIONAL_CONTENT,
  type EducationalContentEntry,
  type SceneSelection,
} from "@/data/educationalContent";

interface InfoPanelProps {
  explanation?: string;
  suggestedNext?: string;
  isThinking?: boolean;
  onSuggestionClick?: (s: string) => void;
  conceptContent?: SearchEntry | null;
  selection: SceneSelection;
}

const THINKING_STATES = [
  "Computing trajectory...",
  "Propagating orbit...",
  "Rendering manifolds...",
];

function labelForSelection(selection: SceneSelection): string | null {
  switch (selection.type) {
    case "body":
      return selection.key === "earth" ? "Earth selected" : "Moon selected";
    case "lagrange":
      return `${selection.key.toUpperCase()} selected`;
    case "family":
      return selection.familyName ?? selection.familyKey;
    case "orbit":
      return selection.familyName ?? selection.familyKey ?? "Orbit selected";
    case "manifold":
      return `${selection.manifoldType} manifold`;
    case "customTrajectory":
      return selection.label ?? "Custom trajectory";
    default:
      return null;
  }
}

export function InfoPanel({
  explanation,
  suggestedNext,
  isThinking,
  onSuggestionClick,
  conceptContent,
  selection,
}: InfoPanelProps) {
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isThinking) return;
    const id = setInterval(() => setThinkingIdx((i) => (i + 1) % THINKING_STATES.length), 800);
    return () => clearInterval(id);
  }, [isThinking]);

  const entry = useMemo((): EducationalContentEntry => {
    if (conceptContent) {
      return {
        title: conceptContent.label,
        beginner: conceptContent.description,
        relatedTerms: [] as const,
      };
    }
    if (isThinking) {
      return {
        title: "Working",
        beginner: THINKING_STATES[thinkingIdx],
        relatedTerms: [] as const,
      };
    }
    if (explanation) {
      return {
        title: "Assistant Result",
        beginner: explanation,
        relatedTerms: [] as const,
      };
    }
    return contentForSelection(selection);
  }, [conceptContent, explanation, isThinking, selection, thinkingIdx]);

  const selectionLabel = labelForSelection(selection);

  return (
    <aside
      className="manifold-panel manifold-fade-in manifold-delay-1"
      style={{
        position: "absolute",
        top: 24,
        left: 24,
        width: 340,
        maxWidth: "calc(100vw - 48px)",
        maxHeight: isExpanded ? "calc(100vh - 48px)" : 74,
        padding: isExpanded ? "14px 16px" : "10px 14px",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
        transition: "max-height 0.2s ease, padding 0.2s ease",
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          appearance: "none",
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
        }}
        aria-expanded={isExpanded}
      >
        <div
          className="manifold-mono"
          style={{
            color: "var(--manifold-cyan)",
            fontSize: 14,
            letterSpacing: "0.4em",
            fontWeight: 700,
          }}
        >
          MANIFOLD
        </div>
        <div
          style={{
            color: "var(--manifold-text-faint)",
            fontSize: 10,
            letterSpacing: "0.15em",
            marginTop: 4,
            textTransform: "uppercase",
          }}
        >
          Cislunar Dynamics Explorer
        </div>
      </button>

      {isExpanded && (
        <>
          <div style={{ height: 1, background: "rgba(0,255,255,0.2)" }} />
          {selectionLabel && (
            <div
              className="manifold-mono"
              style={{ color: "var(--manifold-orange)", fontSize: 9, letterSpacing: "0.12em" }}
            >
              {selectionLabel}
            </div>
          )}
          <div>
            <div
              style={{
                color: "var(--manifold-cyan)",
                fontWeight: 700,
                marginBottom: 6,
                fontSize: 12,
                letterSpacing: "0.08em",
              }}
            >
              {entry.title}
            </div>
            {entry.subtitle && (
              <div style={{ color: "#86a8b8", fontSize: 10, marginBottom: 8 }}>
                {entry.subtitle}
              </div>
            )}
            <div style={{ fontSize: 11, lineHeight: 1.55, color: "#cfe3f0" }}>{entry.beginner}</div>
            {entry.technical && (
              <div
                style={{
                  marginTop: 10,
                  color: "#9bb2c4",
                  fontSize: 10,
                  lineHeight: 1.5,
                  borderLeft: "1px solid rgba(0,255,255,0.3)",
                  paddingLeft: 8,
                }}
              >
                {entry.technical}
              </div>
            )}
          </div>

          {selection.type === "orbit" && (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px" }}>
              {selection.jacobi != null && (
                <>
                  <span style={{ color: "#778899", fontSize: 10 }}>Jacobi C</span>
                  <span style={{ fontSize: 10 }}>{selection.jacobi.toFixed(5)}</span>
                </>
              )}
              {selection.period != null && (
                <>
                  <span style={{ color: "#778899", fontSize: 10 }}>Period</span>
                  <span style={{ fontSize: 10 }}>
                    {selection.periodDays != null
                      ? `${selection.periodDays.toFixed(2)} days`
                      : `${selection.period.toFixed(4)} TU`}
                  </span>
                </>
              )}
              {selection.stability != null && (
                <>
                  <span style={{ color: "#778899", fontSize: 10 }}>Stability</span>
                  <span style={{ fontSize: 10 }}>{selection.stability.toFixed(3)}</span>
                </>
              )}
            </div>
          )}

          {selection.type === "customTrajectory" && selection.jacobi != null && (
            <div style={{ color: "#9bb2c4", fontSize: 10 }}>
              Initial Jacobi C: {selection.jacobi.toFixed(5)}
            </div>
          )}

          {entry.relatedTerms && entry.relatedTerms.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {entry.relatedTerms.slice(0, 5).map((key) => (
                <span
                  key={key}
                  style={{
                    border: "1px solid rgba(0,255,255,0.2)",
                    color: "rgba(0,255,255,0.75)",
                    padding: "3px 5px",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                  }}
                >
                  {EDUCATIONAL_CONTENT[key].title}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid rgba(0,255,255,0.12)",
              paddingTop: 8,
              color: "#8aa0b4",
              fontSize: 10,
              lineHeight: 1.45,
            }}
          >
            {EDUCATIONAL_CONTENT.unstable_orbit_requirement.beginner}
          </div>

          {suggestedNext && !isThinking && !conceptContent && selection.type === "default" && (
            <button
              className="manifold-suggestion"
              onClick={() => onSuggestionClick?.(suggestedNext)}
            >
              <span className="arrow">→</span>
              <span>{suggestedNext}</span>
            </button>
          )}
        </>
      )}
    </aside>
  );
}
