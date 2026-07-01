import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2, X } from "lucide-react";
import type {
  FamilyOrbitInput,
  PlottedSceneItem,
  SceneAPI,
} from "@/components/manifold/SceneContainer";
import type { SceneSelection } from "@/data/educationalContent";

interface Props {
  items: PlottedSceneItem[];
  scene: SceneAPI | null;
  apiUrl: string;
  onClearAll?: () => void;
  onSelectionChange?: (selection: SceneSelection) => void;
  embedded?: boolean;
}

type FamilyResponse = {
  family_key: string;
  label: string;
  orbits: FamilyOrbitInput[];
};

function typeLabel(type: PlottedSceneItem["type"]): string {
  return type.replace("-", " ");
}

function familyBaseName(familyKey: string): string {
  return familyKey.split("_")[0] ?? familyKey;
}

export function PlottedItemsPanel({
  items,
  scene,
  apiUrl,
  onClearAll,
  onSelectionChange,
  embedded = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [familyCache, setFamilyCache] = useState<Record<string, FamilyResponse>>({});
  const [selectedOrbitByFamily, setSelectedOrbitByFamily] = useState<Record<string, number>>({});
  const [loadingFamily, setLoadingFamily] = useState<string | null>(null);
  const [familyError, setFamilyError] = useState<string | null>(null);

  const loadFamily = useCallback(
    async (familyKey: string) => {
      if (familyCache[familyKey]) return familyCache[familyKey];
      setLoadingFamily(familyKey);
      setFamilyError(null);
      try {
        const res = await fetch(`${apiUrl}/family/${familyKey}?n=50`);
        if (!res.ok) throw new Error(`Family request failed (${res.status})`);
        const data = (await res.json()) as FamilyResponse;
        data.orbits.sort((a, b) => a.jacobi - b.jacobi);
        setFamilyCache((prev) => ({ ...prev, [familyKey]: data }));
        setSelectedOrbitByFamily((prev) => ({ ...prev, [familyKey]: prev[familyKey] ?? 0 }));
        return data;
      } catch (err) {
        setFamilyError(err instanceof Error ? err.message : "Could not load family samples.");
        return null;
      } finally {
        setLoadingFamily(null);
      }
    },
    [apiUrl, familyCache],
  );

  const toggleFamily = async (familyKey: string) => {
    const next = expandedItem === familyKey ? null : familyKey;
    setExpandedItem(next);
    if (next) {
      onSelectionChange?.({ type: "family", familyKey, familyName: familyKey });
      await loadFamily(familyKey);
    }
  };

  const selectFamilyOrbit = (familyKey: string, sampleIndex: number) => {
    const family = familyCache[familyKey];
    const orbit = family?.orbits[sampleIndex];
    if (!orbit) return;
    setSelectedOrbitByFamily((prev) => ({ ...prev, [familyKey]: sampleIndex }));
    scene?.highlightByJacobi(orbit.jacobi, familyKey);
    onSelectionChange?.({
      type: "orbit",
      familyKey,
      familyName: family.label,
      jacobi: orbit.jacobi,
      period: orbit.period_tu,
      periodDays: orbit.period_days,
      stability: orbit.stability,
    });
  };

  const addSelectedOrbit = (familyKey: string) => {
    const family = familyCache[familyKey];
    const sampleIndex = selectedOrbitByFamily[familyKey] ?? 0;
    const orbit = family?.orbits[sampleIndex];
    if (!orbit || !scene) return;
    scene.addTrajectory(
      orbit.trajectory,
      items.find((i) => i.id === familyKey)?.color ?? "#AADDFF",
      `${family.label} #${orbit.index + 1}`,
      {
        family: familyBaseName(familyKey),
        familyKey,
        orbitIndex: orbit.index,
        period: orbit.period_tu,
        periodDays: orbit.period_days,
        jacobi: orbit.jacobi,
        stability: orbit.stability,
        itemType: "orbit",
        sourceKey: familyKey,
        serializable: { kind: "orbit", familyKey, orbitIndex: orbit.index },
      },
    );
  };

  return (
    <div
      className="manifold-panel"
      style={{
        position: embedded ? "relative" : "fixed",
        top: embedded ? undefined : 94,
        right: embedded ? undefined : 24,
        width: embedded ? "100%" : isOpen ? 320 : 172,
        maxHeight: embedded ? (isOpen ? 300 : 36) : isOpen ? "calc(100vh - 150px)" : 44,
        padding: embedded ? (isOpen ? "8px 0 0" : 0) : isOpen ? "10px 12px" : "8px 10px",
        zIndex: embedded ? undefined : 12,
        color: "#e0eeff",
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        overflowY: "auto",
        border: embedded ? 0 : undefined,
        background: embedded ? "transparent" : undefined,
        boxShadow: embedded ? "none" : undefined,
        transition: "width 0.2s ease, max-height 0.2s ease, padding 0.2s ease",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
      >
        <button
          className="manifold-icon-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          style={{ flex: 1, justifyContent: "space-between", padding: "5px 7px" }}
        >
          <span>Plotted</span>
          <span>{items.length}</span>
        </button>
        {isOpen && onClearAll && (
          <button
            className="manifold-icon-btn"
            title="Clear all plotted items"
            onClick={onClearAll}
            style={{ padding: "5px 6px" }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{ marginTop: 8 }}>
          {items.length === 0 ? (
            <div style={{ color: "#667788", fontSize: 10, lineHeight: 1.5 }}>
              No plotted orbits, manifolds, missions, or custom trajectories.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => {
                const isFamily = item.type === "family";
                const family = isFamily ? familyCache[item.id] : null;
                const selectedIndex = selectedOrbitByFamily[item.id] ?? 0;
                const selectedOrbit = family?.orbits[selectedIndex];
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "6px 7px",
                      background: item.visible
                        ? "rgba(255,255,255,0.035)"
                        : "rgba(255,255,255,0.015)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isFamily
                          ? "14px 10px 1fr auto auto"
                          : "10px 1fr auto auto",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      {isFamily && (
                        <button
                          onClick={() => void toggleFamily(item.id)}
                          style={{
                            background: "transparent",
                            border: 0,
                            color: "var(--manifold-cyan)",
                            padding: 0,
                            cursor: "pointer",
                          }}
                          aria-label="Expand family controls"
                        >
                          {expandedItem === item.id ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      )}
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: item.color,
                          display: "block",
                        }}
                      />
                      <button
                        onClick={() => {
                          if (item.type === "family") {
                            onSelectionChange?.({
                              type: "family",
                              familyKey: item.id,
                              familyName: item.name,
                            });
                          } else if (
                            item.type === "stable-manifold" ||
                            item.type === "unstable-manifold"
                          ) {
                            onSelectionChange?.({
                              type: "manifold",
                              manifoldType: item.type === "stable-manifold" ? "stable" : "unstable",
                              sourceFamilyKey:
                                typeof item.serializable?.sourceFamilyKey === "string"
                                  ? item.serializable.sourceFamilyKey
                                  : item.sourceKey,
                              orbitIndex:
                                typeof item.serializable?.orbitIndex === "number"
                                  ? item.serializable.orbitIndex
                                  : undefined,
                            });
                          } else if (item.type === "custom-trajectory") {
                            onSelectionChange?.({
                              type: "customTrajectory",
                              id: item.id,
                              label: item.name,
                              jacobi:
                                typeof item.serializable?.jacobi === "number"
                                  ? item.serializable.jacobi
                                  : undefined,
                            });
                          }
                        }}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "inherit",
                          padding: 0,
                          textAlign: "left",
                          minWidth: 0,
                          cursor:
                            item.type === "family" ||
                            item.type === "stable-manifold" ||
                            item.type === "unstable-manifold" ||
                            item.type === "custom-trajectory"
                              ? "pointer"
                              : "default",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </span>
                        <span style={{ color: "#667788", fontSize: 9, textTransform: "uppercase" }}>
                          {typeLabel(item.type)}
                        </span>
                      </button>
                      <button
                        className="manifold-icon-btn"
                        title={item.visible ? "Hide" : "Show"}
                        onClick={() => scene?.setPlottedItemVisible(item.id, !item.visible)}
                        style={{ padding: "4px 5px" }}
                      >
                        {item.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <button
                        className="manifold-icon-btn"
                        title="Remove"
                        onClick={() => scene?.removePlottedItem(item.id)}
                        style={{ padding: "4px 5px", color: "#ff6b6b" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {isFamily && expandedItem === item.id && (
                      <div
                        style={{
                          marginTop: 8,
                          borderTop: "1px solid rgba(0,255,255,0.12)",
                          paddingTop: 8,
                        }}
                      >
                        {loadingFamily === item.id && (
                          <div style={{ color: "#8aa0b4" }}>Loading family samples...</div>
                        )}
                        {familyError && <div style={{ color: "#ff8866" }}>{familyError}</div>}
                        {family && selectedOrbit && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ color: "#8aa0b4" }}>
                              {family.orbits.length} sampled orbits
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={family.orbits.length - 1}
                              step={1}
                              value={selectedIndex}
                              onChange={(event) =>
                                selectFamilyOrbit(item.id, Number(event.target.value))
                              }
                              style={{ width: "100%", accentColor: "var(--manifold-cyan)" }}
                            />
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto 1fr",
                                gap: "3px 8px",
                                color: "#9bb2c4",
                              }}
                            >
                              <span>Jacobi C</span>
                              <span>{selectedOrbit.jacobi.toFixed(5)}</span>
                              <span>Period</span>
                              <span>{selectedOrbit.period_days.toFixed(2)} days</span>
                              <span>Stability</span>
                              <span>{selectedOrbit.stability.toFixed(3)}</span>
                            </div>
                            {selectedOrbit.stability <= 2 && (
                              <div style={{ color: "#ffb36b", lineHeight: 1.35 }}>
                                This sample is stable or near-stable; manifold branches may be
                                unavailable.
                              </div>
                            )}
                            <button
                              className="manifold-icon-btn"
                              onClick={() => addSelectedOrbit(item.id)}
                              style={{ justifyContent: "center" }}
                            >
                              Add Selected Orbit
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
