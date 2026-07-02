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

const STATE_FIELDS = [
  { key: "x", label: "x", min: -1.5, max: 1.5, step: 0.001 },
  { key: "y", label: "y", min: -1.5, max: 1.5, step: 0.001 },
  { key: "z", label: "z", min: -0.5, max: 0.5, step: 0.001 },
  { key: "vx", label: "vx", min: -2, max: 2, step: 0.001 },
  { key: "vy", label: "vy", min: -2, max: 2, step: 0.001 },
  { key: "vz", label: "vz", min: -2, max: 2, step: 0.001 },
] as const;

type StateInput = Record<(typeof STATE_FIELDS)[number]["key"], string>;

const DEFAULT_STATE_INPUT: StateInput = {
  x: "0.8",
  y: "0",
  z: "0",
  vx: "0",
  vy: "0.25",
  vz: "0",
};

const EDITING_NUMBERS = new Set(["", "-", ".", "-."]);

function parseInputValue(value: string): number | null {
  if (EDITING_NUMBERS.has(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStateInput(input: StateInput): CustomTrajectoryConfig["state0"] | null {
  const values = STATE_FIELDS.map((field) => parseInputValue(input[field.key]));
  if (values.some((value) => value == null)) return null;
  return values as CustomTrajectoryConfig["state0"];
}

function formatSliderValue(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export function TrajectoryInputPanel({ onPlot, embedded = false, onPreviewChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Omit<CustomTrajectoryConfig, "state0">>({
    label: DEFAULT_STATE.label,
    tSpan: DEFAULT_STATE.tSpan,
    nPoints: DEFAULT_STATE.nPoints,
    direction: DEFAULT_STATE.direction,
    animate: DEFAULT_STATE.animate,
  });
  const [stateInput, setStateInput] = useState<StateInput>(DEFAULT_STATE_INPUT);
  const [lastValidState, setLastValidState] =
    useState<CustomTrajectoryConfig["state0"]>(DEFAULT_STATE.state0);
  const [error, setError] = useState<string | null>(null);
  const [lastJacobi, setLastJacobi] = useState<number | null>(null);
  const [isPlotting, setIsPlotting] = useState(false);

  useEffect(() => {
    const previewVisible = embedded || isOpen;
    onPreviewChange?.(previewVisible ? lastValidState : null);
    return () => {
      onPreviewChange?.(null);
    };
  }, [embedded, isOpen, lastValidState, onPreviewChange]);

  const updateStateInput = (key: keyof StateInput, value: string) => {
    setStateInput((prev) => {
      const next = { ...prev, [key]: value };
      const parsed = parseStateInput(next);
      if (parsed) setLastValidState(parsed);
      return next;
    });
  };

  const commitStateField = (key: keyof StateInput) => {
    const parsed = parseInputValue(stateInput[key]);
    if (parsed == null) return;
    setStateInput((prev) => ({ ...prev, [key]: formatSliderValue(parsed) }));
  };

  const handlePlot = async () => {
    setError(null);
    setLastJacobi(null);
    const parsedState = parseStateInput(stateInput);
    if (!parsedState) {
      setError("Enter complete finite values for x, y, z, vx, vy, and vz.");
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
      const jacobi = await onPlot({ ...config, state0: parsedState });
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
            {STATE_FIELDS.map((field, index) => {
              const parsed = parseInputValue(stateInput[field.key]);
              const sliderValue = parsed ?? lastValidState[index];
              return (
                <label
                  key={field.key}
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  <span style={{ color: "rgba(0,255,255,0.55)" }}>{field.label}</span>
                  <input
                    className="manifold-input"
                    type="text"
                    inputMode="decimal"
                    value={stateInput[field.key]}
                    onChange={(event) => updateStateInput(field.key, event.target.value)}
                    onBlur={() => commitStateField(field.key)}
                    style={{ minWidth: 0, padding: "5px 6px" }}
                    aria-label={`Initial ${field.label}`}
                  />
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={Math.min(Math.max(sliderValue, field.min), field.max)}
                    onChange={(event) => updateStateInput(field.key, event.target.value)}
                    style={{
                      width: "100%",
                      accentColor: "var(--manifold-cyan)",
                      minWidth: 0,
                    }}
                    aria-label={`Adjust ${field.label}`}
                  />
                </label>
              );
            })}
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
