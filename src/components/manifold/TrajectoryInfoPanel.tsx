import type { TrajectoryMeta } from "@/hooks/useScene";

interface Props {
  meta: TrajectoryMeta;
  onClose: () => void;
}

export function TrajectoryInfoPanel({ meta, onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 20,
        zIndex: 20,
        width: 220,
        padding: "14px 16px",
        background: "rgba(0, 8, 14, 0.92)",
        border: "1px solid rgba(0,255,255,0.3)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 12px rgba(0,255,255,0.15)",
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ color: "#00ffff", letterSpacing: "0.1em", fontSize: 11 }}>
          ORBIT INFO
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label="Close info panel"
        >
          ×
        </button>
      </div>

      <div
        style={{
          borderTop: "1px solid rgba(0,255,255,0.2)",
          paddingTop: 10,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "6px 12px",
          alignItems: "baseline",
        }}
      >
        <span style={{ color: "#888" }}>Label</span>
        <span style={{ wordBreak: "break-word" }}>{meta.label}</span>

        <span style={{ color: "#888" }}>Family</span>
        <span>{meta.family ?? "—"}</span>

        <span style={{ color: "#888" }}>Points</span>
        <span>{meta.pointCount}</span>

        <span style={{ color: "#888" }}>Period</span>
        <span>{meta.period != null ? `${meta.period.toFixed(4)} TU` : "—"}</span>

        <span style={{ color: "#888" }}>Jacobi C</span>
        <span>{meta.jacobi != null ? meta.jacobi.toFixed(6) : "—"}</span>
      </div>
    </div>
  );
}
