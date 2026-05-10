export interface MissionLeg {
  label: string;
  type: string;
  color: string;
  duration: number;
}

interface Props {
  legs: MissionLeg[];
  totalDuration: number;
  onClose: () => void;
}

export function MissionPanel({ legs, totalDuration, onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        top: 380,
        left: 20,
        zIndex: 20,
        width: 320,
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
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ color: "#00ffff", letterSpacing: "0.1em", fontSize: 11 }}>
          MISSION PLAN
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
          aria-label="Close mission panel"
        >
          ×
        </button>
      </div>

      {/* Leg list */}
      <div style={{ borderTop: "1px solid rgba(0,255,255,0.2)", paddingTop: 10 }}>
        {legs.map((leg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            {/* Colored dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: leg.color,
                flexShrink: 0,
                boxShadow: `0 0 4px ${leg.color}`,
              }}
            />
            {/* Label */}
            <span style={{ flex: 1, color: "#c0d8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {leg.label}
            </span>
            {/* Duration */}
            <span style={{ color: "#888", flexShrink: 0 }}>
              {leg.duration.toFixed(2)} TU
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        style={{
          borderTop: "1px solid rgba(0,255,255,0.2)",
          paddingTop: 8,
          display: "flex",
          justifyContent: "space-between",
          color: "#00ffff",
        }}
      >
        <span>Total</span>
        <span>{totalDuration.toFixed(2)} TU</span>
      </div>
    </div>
  );
}
