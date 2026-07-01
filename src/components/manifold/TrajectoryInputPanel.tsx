import { useEffect, useState } from "react";

export type CustomTrajectoryConfig = {
  label: string;
  state0: [number, number, number, number, number, number];
  tSpan: number;
  nPoints: number;
  direction: "forward" | "backward";
  animate: boolean;
};

interface Props {
  onPlot: (config: CustomTrajectoryConfig) => Promise<number | void>;
  embedded?: boolean;
  onPreviewChange?: (state0: CustomTrajectoryConfig["state0"] | null) => void;
}

const DEFAULT_STATE: CustomTrajectoryConfig = {
  label: "Custom trajectory",
  state0: [0.8, 0, 0, 0, 0.25, 0],
  tSpan: 5,
  nPoints: 1000,
  direction: "forward",
  animate: true,
};

export function TrajectoryInputPanel({ onPlot, embedded = false, onPreviewChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<CustomTrajectoryConfig>(DEFAULT_STATE);
  const [error, setError] = useState<string | null>(null);
  const [lastJacobi, setLastJacobi] = useState<number | null>(null);
  const [isPlotting, setIsPlotting] = useState(false);

  useEffect(() => {
    const previewVisible = embedded || isOpen;
    onPreviewChange?.(previewVisible ? config.state0 : null);
    return () => {
      onPreviewChange?.(null);
    };
  }, [config.state0, embedded, isOpen, onPreviewChange]);

  const updateState = (index: number, value: string) => {
    const next = [...config.state0] as CustomTrajectoryConfig["state0"];
    next[index] = Number(value);
    setConfig((prev) => ({ ...prev, state0: next }));
  };

  const handlePlot = async () => {
    setError(null);
    setLastJacobi(null);
    if (!config.state0.every(Number.isFinite)) {
      setError("Enter six finite state values.");
      return;
    }
    if (!Number.isFinite(config.tSpan) || config.tSpan <= 0 || config.tSpan > 50) {
      setError("Integration time must be between 0 and 50 TU.");
      return;
    }
    if (!Number.isFinite(config.nPoints) || config.nPoints < 50 || config.nPoints > 5000) {
      setError("Number of points must be between 50 and 5000.");
      return;
    }
    setIsPlotting(true);
    try {
      const jacobi = await onPlot(config);
      if (typeof jacobi === "number") setLastJacobi(Number(jacobi.toFixed(5)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trajectory propagation failed.");
    } finally {
      setIsPlotting(false);
    }
  };

  return (
    <div
      className="manifold-panel"
      style={{
        position: embedded ? "relative" : "fixed",
        left: embedded ? undefined : 24,
        bottom: embedded ? undefined : 24,
        width: embedded ? "100%" : isOpen ? 314 : 176,
        padding: embedded ? 0 : isOpen ? "12px 14px" : "8px 10px",
        zIndex: embedded ? undefined : 12,
        fontFamily: "'Space Mono', monospace",
        color: "#e0eeff",
        fontSize: 10,
        border: embedded ? 0 : undefined,
        background: embedded ? "transparent" : undefined,
        boxShadow: embedded ? "none" : undefined,
        transition: "width 0.2s ease, padding 0.2s ease",
      }}
    >
      {!embedded && (
        <button
          className="manifold-icon-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{ width: "100%", justifyContent: "space-between" }}
          aria-expanded={isOpen}
        >
          <span>Custom Trajectory</span>
          <span>{isOpen ? "⌄" : "⌃"}</span>
        </button>
      )}

      {(embedded || isOpen) && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#8aa0b4", lineHeight: 1.45 }}>
            Normalized Earth-Moon CR3BP rotating-frame units. Educational sandbox, not a dimensional
            mission input tool.
          </div>
          <input
            className="manifold-input"
            value={config.label}
            onChange={(event) => setConfig((prev) => ({ ...prev, label: event.target.value }))}
            style={{ padding: "6px 8px" }}
            aria-label="Trajectory label"
          />
          <div
            className="trajectory-state-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}
          >
            {["x", "y", "z", "vx", "vy", "vz"].map((label, index) => (
              <label key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "rgba(0,255,255,0.55)" }}>{label}</span>
                <input
                  className="manifold-input"
                  type="number"
                  step="0.001"
                  value={config.state0[index]}
                  onChange={(event) => updateState(index, event.target.value)}
                  style={{ minWidth: 0, padding: "5px 6px" }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ color: "rgba(0,255,255,0.55)" }}>time TU</span>
              <input
                className="manifold-input"
                type="number"
                step="0.25"
                value={config.tSpan}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, tSpan: Number(event.target.value) }))
                }
                style={{ minWidth: 0, padding: "5px 6px" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ color: "rgba(0,255,255,0.55)" }}>points</span>
              <input
                className="manifold-input"
                type="number"
                step="50"
                value={config.nPoints}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, nPoints: Number(event.target.value) }))
                }
                style={{ minWidth: 0, padding: "5px 6px" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="manifold-input"
              value={config.direction}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  direction: event.target.value as "forward" | "backward",
                }))
              }
              style={{ padding: "6px 8px" }}
            >
              <option value="forward">Forward</option>
              <option value="backward">Backward</option>
            </select>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={config.animate}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, animate: event.target.checked }))
                }
              />
              animate
            </label>
          </div>
          <div style={{ color: "#6f8798", lineHeight: 1.4 }}>
            The glowing marker shows initial position; the arrow shows rotating-frame velocity.
          </div>
          {lastJacobi != null && <div style={{ color: "#9bb2c4" }}>Jacobi C: {lastJacobi}</div>}
          {error && <div style={{ color: "#ff8866", lineHeight: 1.4 }}>{error}</div>}
          <button
            className="manifold-icon-btn"
            onClick={() => void handlePlot()}
            disabled={isPlotting}
            style={{ justifyContent: "center" }}
          >
            {isPlotting ? "Plotting..." : "Plot Trajectory"}
          </button>
        </div>
      )}
    </div>
  );
}
