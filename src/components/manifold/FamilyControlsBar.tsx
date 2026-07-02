import { useCallback, useEffect, useState } from "react";
import type { SceneAPI, HighlightedOrbitInfo } from "@/hooks/useScene";
import type { FamilyShownMeta } from "@/utils/sceneCommands";
import { API_BASE_URL } from "@/utils/api";

const API_URL = API_BASE_URL;

interface FamilyOrbit {
  trajectory: [number, number, number][];
  jacobi: number;
  period_tu: number;
  period_days: number;
  stability: number;
  index: number;
}

interface Props {
  familyMeta: FamilyShownMeta;
  scene: SceneAPI | null;
  onShowManifolds: (familyKey: string, orbitIndex: number) => void;
  onClose: () => void;
}

function StabilityLabel({ s }: { s: number }) {
  if (s <= 2) return <span style={{ color: "#44ff88" }}>✓ Stable</span>;
  return <span style={{ color: "#ff4444" }}>⚠ Unstable (×{Math.round(s)})</span>;
}

export function FamilyControlsBar({ familyMeta, scene, onShowManifolds, onClose }: Props) {
  const [nOrbits, setNOrbits] = useState(20);
  const [loading, setLoading] = useState(false);
  const [jacobiValue, setJacobiValue] = useState(familyMeta.jacobi_min);
  const [highlighted, setHighlighted] = useState<HighlightedOrbitInfo | null>(null);

  // Initialize Jacobi slider to current scene state on mount
  useEffect(() => {
    if (scene) {
      setHighlighted(scene.highlightByJacobi(familyMeta.jacobi_min, familyMeta.familyKey));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadFamily = useCallback(async (n: number) => {
    if (!scene) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/family/${familyMeta.familyKey}?n=${n}`);
      const data = (await res.json()) as { orbits: FamilyOrbit[] };
      scene.clearFamily(familyMeta.familyKey);
      scene.addFamilyOrbits(
        data.orbits,
        familyMeta.color,
        familyMeta.jacobi_min,
        familyMeta.jacobi_max,
        familyMeta.familyKey,
      );
      setHighlighted(scene.highlightByJacobi(jacobiValue, familyMeta.familyKey));
    } catch (err) {
      console.error("Failed to reload family:", err);
    } finally {
      setLoading(false);
    }
  }, [scene, familyMeta, jacobiValue]);

  const handleNChange = useCallback((n: number) => {
    setNOrbits(n);
    void reloadFamily(n);
  }, [reloadFamily]);

  const handleJacobiSlider = useCallback((v: number) => {
    setJacobiValue(v);
    if (scene) setHighlighted(scene.highlightByJacobi(v, familyMeta.familyKey));
  }, [scene, familyMeta.familyKey]);

  const handleShowManifolds = useCallback(() => {
    if (!scene) return;
    const mid = scene.getMedianOrbit();
    if (mid) onShowManifolds(mid.familyKey, mid.orbitIndex);
  }, [scene, onShowManifolds]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: 360,
        background: "rgba(0, 8, 14, 0.92)",
        border: "1px solid rgba(0,255,255,0.3)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 16px rgba(0,255,255,0.15)",
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        zIndex: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(0,255,255,0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: familyMeta.color,
              boxShadow: `0 0 6px ${familyMeta.color}`,
            }}
          />
          <span style={{ color: "#00ffff", letterSpacing: "0.15em", fontSize: 10 }}>
            {familyMeta.label.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#556677", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Orbit count slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#778899", fontSize: 10, flexShrink: 0, width: 60 }}>
            Orbits: <span style={{ color: "#00ffff" }}>{nOrbits}</span>
          </span>
          <input
            type="range"
            min={5}
            max={50}
            value={nOrbits}
            onChange={(e) => handleNChange(Number(e.target.value))}
            disabled={loading}
            style={{ flex: 1, accentColor: "#00ffff" }}
          />
        </div>

        {/* Jacobi slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#778899", fontSize: 10, flexShrink: 0, width: 60 }}>
            C: <span style={{ color: "#00ffff" }}>{jacobiValue.toFixed(3)}</span>
          </span>
          <input
            type="range"
            min={familyMeta.jacobi_min}
            max={familyMeta.jacobi_max}
            step={(familyMeta.jacobi_max - familyMeta.jacobi_min) / 200}
            value={jacobiValue}
            onChange={(e) => handleJacobiSlider(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#00ffff" }}
          />
        </div>

        {loading && (
          <div style={{ color: "#00ffff", fontSize: 10, fontStyle: "italic" }}>Propagating…</div>
        )}

        {/* Highlighted orbit info + manifold button */}
        {highlighted && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 10,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              paddingTop: 6,
            }}
          >
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                <span style={{ color: "#556677" }}>Period </span>
                <span style={{ color: "#ddeeff" }}>{highlighted.period_days.toFixed(1)} days</span>
                <span style={{ color: "#556677" }}> &nbsp;|&nbsp; </span>
                <StabilityLabel s={highlighted.stability} />
              </span>
            </div>
            <button
              onClick={handleShowManifolds}
              style={{
                background: "rgba(0,255,255,0.1)",
                border: "1px solid rgba(0,255,255,0.4)",
                color: "#00ffff",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: 9,
                fontFamily: "'Space Mono', monospace",
                letterSpacing: "0.08em",
                flexShrink: 0,
              }}
            >
              Show Manifolds
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
