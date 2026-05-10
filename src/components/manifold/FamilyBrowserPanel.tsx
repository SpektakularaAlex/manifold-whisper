import { useCallback, useEffect, useState } from "react";
import type { SceneAPI, HighlightedOrbitInfo } from "@/hooks/useScene";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

interface FamilyMeta {
  count: number;
  label: string;
  jacobi_min: number;
  jacobi_max: number;
  stability_min: number;
  stability_max: number;
  color: string;
}

interface FamilyOrbit {
  trajectory: [number, number, number][];
  jacobi: number;
  period_tu: number;
  period_days: number;
  stability: number;
  index: number;
}

interface Props {
  scene: SceneAPI | null;
  onShowManifolds: (familyKey: string, orbitIndex: number) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function StabilityLabel({ s }: { s: number }) {
  if (s <= 2) return <span style={{ color: "#44ff88" }}>✓ Stable</span>;
  return <span style={{ color: "#ff4444" }}>⚠ Unstable (×{Math.round(s)})</span>;
}

export function FamilyBrowserPanel({ scene, onShowManifolds }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [families, setFamilies] = useState<Record<string, FamilyMeta> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nOrbits, setNOrbits] = useState(20);
  const [loading, setLoading] = useState(false);
  const [loadedFamilyKey, setLoadedFamilyKey] = useState<string | null>(null);
  const [jacobiValue, setJacobiValue] = useState<number>(0);
  const [highlighted, setHighlighted] = useState<HighlightedOrbitInfo | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/families`)
      .then((r) => r.json())
      .then(setFamilies)
      .catch(console.error);
  }, []);

  const loadFamily = useCallback(
    async (key: string, n: number) => {
      if (!scene) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/family/${key}?n=${n}`);
        const data = (await res.json()) as { orbits: FamilyOrbit[]; label: string };
        const fam = families?.[key];
        if (!fam) return;
        scene.addFamilyOrbits(
          data.orbits,
          fam.color,
          fam.jacobi_min,
          fam.jacobi_max,
          key,
        );
        setLoadedFamilyKey(key);
        setJacobiValue(fam.jacobi_min);
        setHighlighted(scene.highlightByJacobi(fam.jacobi_min));
      } catch (err) {
        console.error("Failed to load family:", err);
      } finally {
        setLoading(false);
      }
    },
    [scene, families],
  );

  const handleCardClick = useCallback(
    (key: string) => {
      setSelected(key);
      void loadFamily(key, nOrbits);
    },
    [loadFamily, nOrbits],
  );

  const handleNChange = useCallback(
    (n: number) => {
      setNOrbits(n);
      if (selected) void loadFamily(selected, n);
    },
    [loadFamily, selected],
  );

  const handleJacobiSlider = useCallback(
    (v: number) => {
      setJacobiValue(v);
      if (scene) setHighlighted(scene.highlightByJacobi(v));
    },
    [scene],
  );

  const handleShowManifolds = useCallback(() => {
    if (!scene) return;
    const mid = scene.getMedianOrbit();
    if (mid) onShowManifolds(mid.familyKey, mid.orbitIndex);
  }, [scene, onShowManifolds]);

  const selectedFam = selected ? families?.[selected] : null;

  return (
    <aside
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        width: collapsed ? 44 : 280,
        maxHeight: "calc(100vh - 48px)",
        background: "rgba(0, 8, 14, 0.92)",
        border: "1px solid rgba(0,255,255,0.25)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 12px rgba(0,255,255,0.12)",
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        overflowY: "auto",
        zIndex: 10,
        transition: "width 0.2s",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: collapsed ? "none" : "1px solid rgba(0,255,255,0.15)",
        }}
      >
        {!collapsed && (
          <span style={{ color: "#00ffff", letterSpacing: "0.2em", fontSize: 10 }}>
            ORBIT FAMILIES
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            color: "#00ffff",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
            marginLeft: collapsed ? 0 : "auto",
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "≡" : "×"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!families && (
            <div style={{ color: "#666", fontStyle: "italic", fontSize: 11 }}>
              Loading families...
            </div>
          )}

          {/* Family cards */}
          {families &&
            Object.entries(families).map(([key, fam]) => (
              <div
                key={key}
                onClick={() => handleCardClick(key)}
                style={{
                  padding: "8px 10px",
                  background: selected === key ? hexToRgba(fam.color, 0.15) : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selected === key ? fam.color + "66" : "rgba(255,255,255,0.08)"}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                {/* Color dot */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: fam.color,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#ddeeff", fontWeight: 600, fontSize: 11 }}>{fam.label}</div>
                  <div style={{ color: "#778899", fontSize: 10, marginTop: 2 }}>
                    {fam.count.toLocaleString()} orbits &nbsp;·&nbsp; C: {fam.jacobi_min.toFixed(2)}–{fam.jacobi_max.toFixed(2)}
                  </div>
                </div>
                <div
                  style={{
                    background: hexToRgba(fam.color, 0.2),
                    color: fam.color,
                    fontSize: 9,
                    padding: "2px 5px",
                    flexShrink: 0,
                  }}
                >
                  {fam.count}
                </div>
              </div>
            ))}

          {/* Controls for selected family */}
          {selected && selectedFam && (
            <div
              style={{
                marginTop: 4,
                padding: "10px 12px",
                background: "rgba(0,255,255,0.05)",
                border: "1px solid rgba(0,255,255,0.15)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* N orbits slider */}
              <div>
                <div style={{ color: "#aabbcc", fontSize: 10, marginBottom: 4 }}>
                  Orbits to show: <span style={{ color: "#00ffff" }}>{nOrbits}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={nOrbits}
                  onChange={(e) => handleNChange(Number(e.target.value))}
                  disabled={loading}
                  style={{ width: "100%", accentColor: "#00ffff" }}
                />
              </div>

              {loading && (
                <div style={{ color: "#00ffff", fontSize: 10, fontStyle: "italic" }}>
                  Propagating orbits...
                </div>
              )}

              {/* Jacobi energy slider */}
              {!loading && loadedFamilyKey === selected && (
                <>
                  <div>
                    <div style={{ color: "#aabbcc", fontSize: 10, marginBottom: 4 }}>
                      Jacobi C: <span style={{ color: "#00ffff" }}>{jacobiValue.toFixed(4)}</span>
                    </div>
                    <input
                      type="range"
                      min={selectedFam.jacobi_min}
                      max={selectedFam.jacobi_max}
                      step={(selectedFam.jacobi_max - selectedFam.jacobi_min) / 200}
                      value={jacobiValue}
                      onChange={(e) => handleJacobiSlider(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#00ffff" }}
                    />
                  </div>

                  {highlighted && (
                    <div style={{ fontSize: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div>
                        <span style={{ color: "#778899" }}>C = </span>
                        <span style={{ color: "#ddeeff" }}>{highlighted.jacobi.toFixed(4)}</span>
                        <span style={{ color: "#778899" }}> &nbsp;|&nbsp; Period = </span>
                        <span style={{ color: "#ddeeff" }}>{highlighted.period_days.toFixed(1)} days</span>
                      </div>
                      <div>
                        <span style={{ color: "#778899" }}>Stability: </span>
                        <StabilityLabel s={highlighted.stability} />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleShowManifolds}
                    style={{
                      background: "rgba(0,255,255,0.1)",
                      border: "1px solid rgba(0,255,255,0.4)",
                      color: "#00ffff",
                      cursor: "pointer",
                      padding: "6px 10px",
                      fontSize: 10,
                      fontFamily: "'Space Mono', monospace",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Show manifolds for middle orbit
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
