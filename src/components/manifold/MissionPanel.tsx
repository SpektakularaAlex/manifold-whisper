import { useState } from "react";
import type { CRSystem, FamilyMeta } from "@/data/systems";
import { FamilyPicker } from "./SystemControlPanel";
import { MANIFOLD_COLORS } from "@/components/manifold/constants";

export interface MissionLeg {
  label: string;
  type: string;
  color: string;
  duration: number;
}

interface BuilderLeg {
  id: string;
  type: "orbit" | "manifold_departure" | "manifold_arrival";
  family: string;
  libr: number | null;
  branch: string | null;
  label: string;
  color: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const SEL: React.CSSProperties = {
  background: "rgba(0,8,14,0.9)",
  border: "1px solid rgba(0,255,255,0.25)",
  color: "#e0eeff",
  fontFamily: "'Space Mono', monospace",
  fontSize: 10,
  padding: "3px 5px",
  outline: "none",
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  borderRadius: 0,
  cursor: "pointer",
};

interface Props {
  legs: MissionLeg[];
  totalDuration: number;
  onClose: () => void;
  selectedSystem?: CRSystem | null;
  onMissionResult?: (result: unknown) => void;
}

export function MissionPanel({
  legs,
  totalDuration,
  onClose,
  selectedSystem,
  onMissionResult,
}: Props) {
  const [builderLegs, setBuilderLegs] = useState<BuilderLeg[]>([]);
  const [isFlyingMission, setIsFlyingMission] = useState(false);

  function addLeg() {
    const firstFamily = selectedSystem?.families[0];
    setBuilderLegs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        type: "orbit",
        family: firstFamily?.id ?? "lyapunov",
        libr: null,
        branch: null,
        label: "",
        color: firstFamily?.color ?? "#00FFFF",
      },
    ]);
  }

  function removeLeg(i: number) {
    setBuilderLegs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateLeg(i: number, patch: Partial<BuilderLeg>) {
    setBuilderLegs((prev) => prev.map((leg, idx) => (idx === i ? { ...leg, ...patch } : leg)));
  }

  async function flyMission() {
    if (!selectedSystem || builderLegs.length === 0) return;
    setIsFlyingMission(true);
    try {
      const res = await fetch(`${API_URL}/mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legs: builderLegs, system: selectedSystem.id }),
      });
      const data = await res.json();
      onMissionResult?.(data);
    } catch (err) {
      console.error("Mission failed:", err);
    } finally {
      setIsFlyingMission(false);
    }
  }
  return (
    <div
      style={{
        position: "fixed",
        top: 380,
        left: 20,
        zIndex: 20,
        width: 360,
        maxHeight: "calc(100vh - 420px)",
        overflowY: "auto",
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
        <span style={{ color: "#00ffff", letterSpacing: "0.1em", fontSize: 11 }}>MISSION PLAN</span>
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

      {/* Builder section (shown when selectedSystem is provided) */}
      {selectedSystem && (
        <div
          style={{
            borderBottom: "1px solid rgba(0,255,255,0.15)",
            paddingBottom: 10,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "rgba(0,255,255,0.5)",
              letterSpacing: "0.15em",
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Build Sequence
          </div>
          {builderLegs.map((leg, i) => {
            const famObj = selectedSystem.families.find((f) => f.id === leg.family) ?? null;
            return (
              <div
                key={leg.id}
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "flex-start",
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <select
                  style={{ ...SEL, flex: "0 0 auto" }}
                  value={leg.type}
                  onChange={(e) => updateLeg(i, { type: e.target.value as BuilderLeg["type"] })}
                >
                  <option value="orbit">Orbit</option>
                  <option value="manifold_departure">Depart (unstable)</option>
                  <option value="manifold_arrival">Arrive (stable)</option>
                </select>
                <div style={{ flex: "1 1 120px", minWidth: 0 }}>
                  <FamilyPicker
                    families={selectedSystem.families}
                    selectedFamily={famObj}
                    selectedLibr={leg.libr}
                    selectedBranch={leg.branch}
                    onSelect={(fam: FamilyMeta, libr: number | null, branch: string | null) => {
                      const typeLabel =
                        leg.type === "orbit"
                          ? "orbit"
                          : leg.type === "manifold_departure"
                            ? "departure"
                            : "arrival";
                      let lbl = fam.label;
                      if (libr != null) lbl += ` L${libr}`;
                      if (branch) lbl += ` ${branch}`;
                      lbl += ` ${typeLabel}`;
                      updateLeg(i, {
                        family: fam.id,
                        libr,
                        branch,
                        label: lbl,
                        color:
                          leg.type === "manifold_departure"
                            ? MANIFOLD_COLORS.unstable
                            : leg.type === "manifold_arrival"
                              ? MANIFOLD_COLORS.stable
                              : fam.color,
                      });
                    }}
                    direction="down"
                  />
                </div>
                <input
                  value={leg.label}
                  onChange={(e) => updateLeg(i, { label: e.target.value })}
                  placeholder="label"
                  style={{ ...SEL, flex: "1 1 60px", minWidth: 0 }}
                />
                <button
                  onClick={() => removeLeg(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ff4444",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "0 2px",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              onClick={addLeg}
              style={{
                background: "rgba(0,255,255,0.08)",
                border: "1px solid rgba(0,255,255,0.3)",
                color: "var(--manifold-cyan)",
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              + Add Leg
            </button>
            {builderLegs.length > 0 && (
              <button
                onClick={flyMission}
                disabled={isFlyingMission}
                style={{
                  background: isFlyingMission ? "rgba(0,255,255,0.04)" : "rgba(0,255,255,0.12)",
                  border: `1px solid ${isFlyingMission ? "rgba(0,255,255,0.2)" : "var(--manifold-cyan)"}`,
                  color: isFlyingMission ? "rgba(0,255,255,0.3)" : "var(--manifold-cyan)",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  padding: "4px 10px",
                  cursor: isFlyingMission ? "not-allowed" : "pointer",
                }}
              >
                {isFlyingMission ? "..." : "▶ Fly Mission"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leg list (agent-driven) */}
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
            <span
              style={{
                flex: 1,
                color: "#c0d8f0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {leg.label}
            </span>
            {/* Duration */}
            <span style={{ color: "#888", flexShrink: 0 }}>{leg.duration.toFixed(2)} TU</span>
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
