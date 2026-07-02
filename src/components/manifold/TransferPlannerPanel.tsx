import { useCallback, useState } from "react";
import type { TrajectoryMeta } from "@/hooks/useScene";
import { API_BASE_URL } from "@/utils/api";

const API_URL = API_BASE_URL;

export interface TransferSegment {
  label: string;
  trajectory: [number, number, number][];
  color: string;
  duration_tu: number;
  duration_days: number;
  branch_id?: string;
  type?: string;
}

export interface TransferResult {
  segments: TransferSegment[];
  total_trajectory: [number, number, number][];
  total_duration_tu: number;
  total_duration_days: number;
  closest_approach_lu: number;
  closest_approach_points?: {
    departure: [number, number, number];
    arrival: [number, number, number];
  };
  departure_branch_id?: string;
  arrival_branch_id?: string;
  disclaimer?: string;
}

interface Props {
  active: boolean;
  departure: TrajectoryMeta | null;
  arrival: TrajectoryMeta | null;
  onActivate: () => void;
  onDeactivate: () => void;
  onClearSelection: () => void;
  onTransferResult: (result: TransferResult) => void;
  embedded?: boolean;
}

function OrbitSlot({ label, meta }: { label: string; meta: TrajectoryMeta | null }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: meta ? "rgba(0,255,255,0.07)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${meta ? "rgba(0,255,255,0.35)" : "rgba(255,255,255,0.1)"}`,
        minHeight: 48,
      }}
    >
      <div style={{ color: "#556677", fontSize: 9, letterSpacing: "0.2em", marginBottom: 4 }}>
        {label}
      </div>
      {meta ? (
        <>
          <div style={{ color: "#ddeeff", fontSize: 11, fontWeight: 600 }}>
            {meta.familyKey ?? meta.family ?? "—"}
          </div>
          <div style={{ color: "#778899", fontSize: 10, marginTop: 2 }}>
            C = {meta.jacobi?.toFixed(3) ?? "—"}
            {meta.periodDays != null && <> &nbsp;·&nbsp; {meta.periodDays.toFixed(1)} days</>}
          </div>
        </>
      ) : (
        <div style={{ color: "#445566", fontSize: 10, fontStyle: "italic" }}>
          Click any orbit in the scene
        </div>
      )}
    </div>
  );
}

export function TransferPlannerPanel({
  active,
  departure,
  arrival,
  onActivate,
  onDeactivate,
  onClearSelection,
  onTransferResult,
  embedded = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPlan = !!(departure?.familyKey && arrival?.familyKey && !loading);

  const handlePlan = useCallback(async () => {
    if (!departure?.familyKey || !arrival?.familyKey) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departure_family_key: departure.familyKey,
          departure_orbit_index: departure.orbitIndex ?? 0,
          arrival_family_key: arrival.familyKey,
          arrival_orbit_index: arrival.orbitIndex ?? 0,
          system: "earth-moon",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Transfer failed");
      }
      const data = (await res.json()) as TransferResult;
      setResult(data);
      onTransferResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [departure, arrival, onTransferResult]);

  const handleToggle = () => {
    if (active) {
      onDeactivate();
      setResult(null);
      setError(null);
    } else {
      onActivate();
    }
  };

  return (
    <div
      style={{
        position: embedded ? "relative" : "fixed",
        bottom: embedded ? undefined : 160,
        left: embedded ? undefined : 24,
        width: embedded ? "100%" : 300,
        background: "rgba(0, 8, 14, 0.92)",
        border: `1px solid ${active ? "rgba(255,180,0,0.5)" : "rgba(0,255,255,0.2)"}`,
        backdropFilter: "blur(10px)",
        boxShadow: active ? "0 0 16px rgba(255,180,0,0.2)" : "0 0 8px rgba(0,255,255,0.08)",
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        zIndex: embedded ? undefined : 15,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer",
        }}
        onClick={handleToggle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: active ? "#FFB400" : "#334455",
              boxShadow: active ? "0 0 6px #FFB400" : "none",
            }}
          />
          <span
            style={{
              color: active ? "#FFB400" : "#00ffff",
              letterSpacing: "0.2em",
              fontSize: 10,
            }}
          >
            MISSION PLANNER
          </span>
        </div>
        <span style={{ color: "#556677", fontSize: 14 }}>{active ? "▲" : "▼"}</span>
      </div>

      {active && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: "#778899", fontSize: 10, lineHeight: 1.5 }}>
            {!departure
              ? "↓ Click a departure orbit in the scene"
              : !arrival
                ? "↓ Click an arrival orbit in the scene"
                : "Ready to plan transfer"}
          </div>

          <OrbitSlot label="DEPARTURE" meta={departure} />
          <OrbitSlot label="ARRIVAL" meta={arrival} />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                onClearSelection();
                setResult(null);
                setError(null);
              }}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#778899",
                cursor: "pointer",
                padding: "6px 0",
                fontSize: 10,
                fontFamily: "'Space Mono', monospace",
              }}
            >
              Clear
            </button>
            <button
              onClick={() => void handlePlan()}
              disabled={!canPlan}
              style={{
                flex: 2,
                background: canPlan ? "rgba(255,180,0,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${canPlan ? "rgba(255,180,0,0.5)" : "rgba(255,255,255,0.08)"}`,
                color: canPlan ? "#FFB400" : "#445566",
                cursor: canPlan ? "pointer" : "default",
                padding: "6px 0",
                fontSize: 10,
                fontFamily: "'Space Mono', monospace",
                letterSpacing: "0.1em",
              }}
            >
              {loading ? "Computing…" : "Plan Transfer"}
            </button>
          </div>

          {error && (
            <div
              style={{
                color: "#ff4444",
                fontSize: 10,
                padding: "6px 8px",
                background: "rgba(255,0,0,0.08)",
                border: "1px solid rgba(255,0,0,0.2)",
              }}
            >
              {error}
            </div>
          )}

          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  color: "#FFB400",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "center",
                  padding: "6px 0",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                TOF: {result.total_duration_days.toFixed(1)} days
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {result.segments.map((seg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: seg.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        color: "#aabbcc",
                        fontSize: 10,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {seg.label}
                    </span>
                    <span style={{ color: "#556677", fontSize: 10, flexShrink: 0 }}>
                      {seg.duration_days.toFixed(1)}d
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ color: "#aabbcc", fontSize: 10, lineHeight: 1.45, marginTop: 2 }}>
                Closest approach:{" "}
                <span style={{ color: "#FFB400" }}>{result.closest_approach_lu.toFixed(5)} LU</span>
                {result.departure_branch_id && <> · dep {result.departure_branch_id}</>}
                {result.arrival_branch_id && <> · arr {result.arrival_branch_id}</>}
              </div>

              <div style={{ color: "#778899", fontSize: 9, lineHeight: 1.45 }}>
                {result.disclaimer ??
                  "Educational approximate transfer, not an optimized mission trajectory."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
