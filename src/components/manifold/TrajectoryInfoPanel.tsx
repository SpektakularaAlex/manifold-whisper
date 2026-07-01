import type { TrajectoryMeta } from "@/hooks/useScene";

interface Props {
  meta: TrajectoryMeta;
  onClose: () => void;
  onShowManifolds?: (meta: TrajectoryMeta, type: "stable" | "unstable" | "both") => void;
}

function StabilityLabel({ s }: { s: number | undefined }) {
  if (s == null) return <span>—</span>;
  if (s <= 2) return <span style={{ color: "#44ff88" }}>✓ Stable</span>;
  return <span style={{ color: "#ff4444" }}>⚠ Unstable (×{Math.round(s)})</span>;
}

const FAMILY_LABELS: Record<string, string> = {
  halo_L1_N: "L1 North Halo",
  halo_L1_S: "L1 South Halo",
  halo_L2_N: "L2 North Halo",
  halo_L2_S: "L2 South Halo",
  halo_L3_N: "L3 North Halo",
  halo_L3_S: "L3 South Halo",
  lyapunov_L1: "L1 Lyapunov",
  lyapunov_L2: "L2 Lyapunov",
  lyapunov_L3: "L3 Lyapunov",
  butterfly_N: "Butterfly North",
  butterfly_S: "Butterfly South",
  dragonfly_N: "Dragonfly North",
  dragonfly_S: "Dragonfly South",
  axial_L1: "L1 Axial",
  axial_L2: "L2 Axial",
  axial_L3: "L3 Axial",
  axial_L4: "L4 Axial",
  axial_L5: "L5 Axial",
  vertical_L1: "L1 Vertical",
  vertical_L2: "L2 Vertical",
  vertical_L3: "L3 Vertical",
  vertical_L4: "L4 Vertical",
  vertical_L5: "L5 Vertical",
  long_period_L4: "L4 Long Period",
  long_period_L5: "L5 Long Period",
  short_period_L4: "L4 Short Period",
  short_period_L5: "L5 Short Period",
  distant_prograde: "Distant Prograde",
  distant_retrograde: "Distant Retrograde",
  low_prograde_E: "Low Prograde (East)",
  low_prograde_W: "Low Prograde (West)",
};

function familyLabel(meta: TrajectoryMeta): string {
  if (meta.familyKey && FAMILY_LABELS[meta.familyKey]) return FAMILY_LABELS[meta.familyKey];
  if (meta.family) {
    const f = meta.family;
    const libr = meta.libr != null ? ` L${meta.libr}` : "";
    const branch = meta.branch ? ` ${meta.branch === "N" ? "North" : "South"}` : "";
    return `${f}${libr}${branch}`;
  }
  return "—";
}

export function TrajectoryInfoPanel({ meta, onClose, onShowManifolds }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 90,
        right: 20,
        zIndex: 20,
        width: 240,
        padding: "14px 16px",
        background: "rgba(0, 8, 14, 0.92)",
        border: "1px solid rgba(0,255,255,0.3)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 12px rgba(0,255,255,0.15)",
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#00ffff", letterSpacing: "0.1em", fontSize: 11 }}>ORBIT INFO</span>
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
        <span style={{ color: "#778899" }}>Family</span>
        <span>{familyLabel(meta)}</span>

        <span style={{ color: "#778899" }}>Period</span>
        <span>
          {meta.periodDays != null
            ? `${meta.periodDays.toFixed(1)} days`
            : meta.period != null
              ? `${meta.period.toFixed(4)} TU`
              : "—"}
          {meta.period != null && meta.periodDays != null && (
            <span style={{ color: "#556677", fontSize: 10 }}> ({meta.period.toFixed(2)} TU)</span>
          )}
        </span>

        <span style={{ color: "#778899" }}>Jacobi C</span>
        <span>{meta.jacobi != null ? meta.jacobi.toFixed(4) : "—"}</span>

        <span style={{ color: "#778899" }}>Stability</span>
        <StabilityLabel s={meta.stability} />
      </div>

      {onShowManifolds && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(
            [
              ["Stable", "stable", "#0066FF"],
              ["Unstable", "unstable", "#FF2200"],
              ["Both", "both", "#00ffff"],
            ] as const
          ).map(([label, type, color]) => (
            <button
              key={type}
              onClick={() => onShowManifolds(meta, type)}
              style={{
                background: "rgba(0,255,255,0.06)",
                border: `1px solid ${color}`,
                color,
                cursor: "pointer",
                padding: "7px 4px",
                fontSize: 9,
                fontFamily: "'Space Mono', monospace",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
