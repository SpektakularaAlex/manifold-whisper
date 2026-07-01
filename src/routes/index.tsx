import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useRef, useState } from "react";
import axios from "axios";
import {
  SceneContainer,
  type SceneAPI,
  type TrajectoryMeta,
  type PlottedSceneItem,
} from "@/components/manifold/SceneContainer";
import { InfoPanel } from "@/components/manifold/InfoPanel";
import { ChatInput } from "@/components/manifold/ChatInput";
import { SceneControls } from "@/components/manifold/SceneControls";
import { TrajectoryInfoPanel } from "@/components/manifold/TrajectoryInfoPanel";
import { MissionPanel, type MissionLeg } from "@/components/manifold/MissionPanel";
import { FamilyBrowserPanel } from "@/components/manifold/FamilyBrowserPanel";
import {
  TransferPlannerPanel,
  type TransferResult,
} from "@/components/manifold/TransferPlannerPanel";
import { FamilyControlsBar } from "@/components/manifold/FamilyControlsBar";
import { PlottedItemsPanel } from "@/components/manifold/PlottedItemsPanel";
import {
  TrajectoryInputPanel,
  type CustomTrajectoryConfig,
} from "@/components/manifold/TrajectoryInputPanel";
import { useAgent } from "@/hooks/useAgent";
import {
  executeCommand,
  setSceneTransform,
  renderOrbit,
  type FamilyShownMeta,
} from "@/utils/sceneCommands";
import type { AgentCommand } from "@/hooks/useAgent";
import {
  ACTIVE_SYSTEMS,
  BACKGROUND_PLANETS,
  EARTH_MOON_SYSTEM,
  transformedLagrangePoints,
  type CRSystem,
  type SearchEntry,
} from "@/data/systems";
import { SystemControlPanel, type VisualizeParams } from "@/components/manifold/SystemControlPanel";
import { SearchBar } from "@/components/manifold/SearchBar";
import { SystemMiniMap } from "@/components/manifold/SystemMiniMap";
import { buildSavedSceneStateFromAppState, serializeSceneState } from "@/utils/sceneSerialization";
import { selectionFromTrajectory, type SceneSelection } from "@/data/educationalContent";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MANIFOLD — Cislunar Dynamics Explorer" },
      {
        name: "description",
        content:
          "Explore cislunar orbital dynamics through natural language. An interactive 3D space visualization tool.",
      },
    ],
  }),
});

function Index() {
  const sceneRef = useRef<SceneAPI>(null);
  const [sceneAPI, setSceneAPI] = useState<SceneAPI | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [selectedTrajectory, setSelectedTrajectory] = useState<TrajectoryMeta | null>(null);
  const [missionLegs, setMissionLegs] = useState<MissionLeg[]>([]);
  const [missionDuration, setMissionDuration] = useState(0);
  const [missionActive, setMissionActive] = useState(false);
  const [plannerActive, setPlannerActive] = useState(false);
  const [plannerDep, setPlannerDep] = useState<TrajectoryMeta | null>(null);
  const [plannerArr, setPlannerArr] = useState<TrajectoryMeta | null>(null);
  const [activeControlFamily, setActiveControlFamily] = useState<FamilyShownMeta | null>(null);
  const { submit, isThinking, explanation, suggestedNext } = useAgent();
  const [selectedSystem, setSelectedSystem] = useState<CRSystem>(EARTH_MOON_SYSTEM);
  const [isLoading, setIsLoading] = useState(false);
  const [lastOrbitMeta, setLastOrbitMeta] = useState<{
    period?: number;
    jacobi?: number;
    totalMembers?: number;
  } | null>(null);
  const [preSelectedFamilyId, setPreSelectedFamilyId] = useState<string | null>(null);
  const [conceptContent, setConceptContent] = useState<SearchEntry | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const [plottedItems, setPlottedItems] = useState<PlottedSceneItem[]>([]);
  const [sceneSelection, setSceneSelection] = useState<SceneSelection>({ type: "default" });
  const [pinnedPreviewAnchor, setPinnedPreviewAnchor] = useState<string | null>(null);
  const pinnedPreviewAnchorRef = useRef<string | null>(null);
  const [sceneKey, setSceneKey] = useState<string | null>(null);
  const [sceneKeyCopied, setSceneKeyCopied] = useState(false);
  const previewCacheRef = useRef<
    Map<
      string,
      Array<{
        familyKey: string;
        label: string;
        color: string;
        orbitIndex: number;
        trajectory: [number, number, number][];
      }>
    >
  >(new Map());

  const closePinnedPreviews = useCallback(() => {
    pinnedPreviewAnchorRef.current = null;
    setPinnedPreviewAnchor(null);
    sceneRef.current?.clearHoverPreviews();
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pinnedPreviewAnchorRef.current) {
        closePinnedPreviews();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePinnedPreviews]);

  const handleSubmit = useCallback(
    async (message: string) => {
      setChatInput("");
      const commands = await submit(message);
      if (!sceneRef.current) return;
      for (const cmd of commands) {
        executeCommand(cmd, sceneRef.current, setActiveControlFamily);
        _extractMission(cmd, setMissionLegs, setMissionDuration, setMissionActive);
      }
    },
    [submit],
  );

  const handleSuggestionClick = useCallback(
    (s: string) => {
      void handleSubmit(s);
    },
    [handleSubmit],
  );

  const handleToggleLabels = useCallback(() => {
    setLabelsVisible((prev) => {
      const next = !prev;
      sceneRef.current?.showLagrangePoints(next);
      return next;
    });
  }, []);

  // Show manifolds for a clicked/family orbit
  const handleShowManifolds = useCallback(
    async (
      familyKey: string,
      orbitIndex: number,
      type: "stable" | "unstable" | "both" = "both",
    ) => {
      // Parse familyKey back into family/libr/branch for the manifold endpoint
      const parsed = _parseFamilyKey(familyKey);
      try {
        const res = await axios.post(`${API_URL}/manifold`, {
          ...parsed,
          index: orbitIndex,
          type,
          n_branches: 80,
        });
        if (sceneRef.current) {
          const cmd: AgentCommand = {
            action: "show_manifold",
            data: {
              ...res.data,
              _sceneSource: {
                familyKey,
                sourceFamilyKey: familyKey,
                orbitIndex,
              },
            },
          };
          executeCommand(cmd, sceneRef.current);
        }
      } catch (err) {
        console.error("Manifold computation failed:", err);
      }
    },
    [],
  );

  // Handler passed to TrajectoryInfoPanel's Show Manifolds button
  const handleManifoldFromMeta = useCallback(
    (meta: TrajectoryMeta, type: "stable" | "unstable" | "both" = "both") => {
      const familyKey = meta.familyKey ?? _buildFamilyKey(meta.family, meta.libr, meta.branch);
      void handleShowManifolds(familyKey, meta.orbitIndex ?? 0, type);
    },
    [handleShowManifolds],
  );

  const handleVisualize = useCallback(
    async (params: VisualizeParams) => {
      if (!sceneRef.current) return;
      setIsLoading(true);
      const { systemId, family, libr, branch, index, showManifolds } = params;
      try {
        const orbitRes = await fetch(`${API_URL}/orbit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ family, libr, branch, index, system: systemId }),
        });
        if (!orbitRes.ok) throw new Error(`Orbit ${orbitRes.status}`);
        const orbitData = (await orbitRes.json()) as {
          trajectory: [number, number, number][];
          period?: number;
          jacobi?: number;
          total_members?: number;
        };
        const famMeta = selectedSystem.families.find((f) => f.id === family);
        const orbitColor = famMeta?.color ?? "#00FFFF";
        renderOrbit(
          orbitData.trajectory,
          `${famMeta?.label ?? family} #${index + 1}`,
          orbitColor,
          {
            period: orbitData.period,
            jacobi: orbitData.jacobi,
            family,
            familyKey: _buildFamilyKey(family, libr, branch),
            libr,
            branch,
            orbitIndex: index,
            serializable: {
              kind: "orbit",
              familyKey: _buildFamilyKey(family, libr, branch),
              orbitIndex: index,
            },
          },
          sceneRef.current,
        );
        setLastOrbitMeta({
          period: orbitData.period,
          jacobi: orbitData.jacobi,
          totalMembers: orbitData.total_members,
        });
        if (showManifolds !== "none") {
          const mRes = await fetch(`${API_URL}/manifold`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              family,
              libr,
              branch,
              index,
              type: showManifolds,
              system: systemId,
              n_branches: 20,
              propagation_time: 3.0,
            }),
          });
          if (!mRes.ok) throw new Error(`Manifold ${mRes.status}`);
          const mData = await mRes.json();
          const familyKey = _buildFamilyKey(family, libr, branch);
          const cmd: AgentCommand = {
            action: "show_manifold",
            data: {
              ...mData,
              _sceneSource: {
                familyKey,
                sourceFamilyKey: familyKey,
                orbitIndex: index,
              },
            },
          };
          executeCommand(cmd, sceneRef.current);
        }
      } catch (err) {
        console.error("Visualize failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedSystem],
  );

  const handleSystemChange = useCallback((system: CRSystem) => {
    if (system.id !== EARTH_MOON_SYSTEM.id) return;
    setSelectedSystem(system);
    sceneRef.current?.clearTrajectories();
    setSceneTransform(system.sceneConfig.originShift, system.sceneConfig.displayScale);
    sceneRef.current?.updateSystemBodies({
      ...system.bodyConfig,
      primaryScenePos: system.sceneConfig.primaryScenePos,
      secondaryScenePos: system.sceneConfig.secondaryScenePos,
    });
    sceneRef.current?.updateLagrangePoints(transformedLagrangePoints(system));
    sceneRef.current?.showLagrangePoints(true);
    sceneRef.current?.setCameraView(system.sceneConfig.cameraPos, system.sceneConfig.cameraTarget);
    setLastOrbitMeta(null);
    setPreSelectedFamilyId(null);
    setConceptContent(null);
    setSceneSelection({ type: "default" });
  }, []);

  // Apply Earth-Moon config once the scene is ready
  React.useEffect(() => {
    if (sceneAPI) {
      setSceneTransform([0, 0, 0], 1.0);
      sceneAPI.updateSystemBodies({
        ...EARTH_MOON_SYSTEM.bodyConfig,
        primaryScenePos: EARTH_MOON_SYSTEM.sceneConfig.primaryScenePos,
        secondaryScenePos: EARTH_MOON_SYSTEM.sceneConfig.secondaryScenePos,
      });
      sceneAPI.updateLagrangePoints(transformedLagrangePoints(EARTH_MOON_SYSTEM));
      sceneAPI.setBackgroundPlanets(BACKGROUND_PLANETS);
      sceneAPI.showLagrangePoints(true);
      setLabelsVisible(true);
    }
  }, [sceneAPI]);

  const handleSearchSelectSystem = useCallback(
    (systemId: string) => {
      const sys = ACTIVE_SYSTEMS.find((s) => s.id === systemId);
      if (sys) handleSystemChange(sys);
    },
    [handleSystemChange],
  );

  const handleSearchSelectFamily = useCallback((systemId: string, familyId: string) => {
    const sys = ACTIVE_SYSTEMS.find((s) => s.id === systemId);
    if (sys) {
      setSelectedSystem(sys);
      setPreSelectedFamilyId(familyId);
      setConceptContent(null);
    }
  }, []);

  const handleShowConcept = useCallback((concept: SearchEntry) => {
    setConceptContent(concept);
  }, []);

  // Routes orbit clicks: if planner is active, assign departure/arrival; otherwise show info panel
  const handleOrbitClick = useCallback(
    (meta: TrajectoryMeta) => {
      if (plannerActive) {
        if (!plannerDep) {
          setPlannerDep(meta);
          sceneRef.current?.setMissionSelectHighlight([meta.id ?? ""]);
        } else if (!plannerArr) {
          setPlannerArr(meta);
          sceneRef.current?.setMissionSelectHighlight(
            [plannerDep.id ?? "", meta.id ?? ""].filter(Boolean),
          );
        }
        return;
      }
      setSelectedTrajectory(meta);
      setSceneSelection(selectionFromTrajectory(meta));
    },
    [plannerActive, plannerDep, plannerArr],
  );

  // Renders transfer result segments and animates spacecraft
  const handleTransferResult = useCallback((result: TransferResult) => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const seg of result.segments) {
      const lower = seg.label.toLowerCase();
      scene.addTrajectory(seg.trajectory, seg.color, seg.label, {
        itemType: lower.includes("unstable")
          ? "unstable-manifold"
          : lower.includes("stable")
            ? "stable-manifold"
            : "mission",
        sourceKey: "mission-transfer",
        serializable: { kind: "transferSegment", label: seg.label },
      });
    }
    if (result.closest_approach_points?.departure) {
      scene.addMarker(result.closest_approach_points.departure, "#FFFF00", "Closest approach");
    }
    if (result.total_trajectory.length > 0) {
      scene.animateSpacecraft(result.total_trajectory, result.total_duration_tu);
    }
  }, []);

  const showPreviewFamiliesForAnchor = useCallback(
    (target: string, pinned: boolean) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const familyKeys = _previewFamiliesForTarget(target);
      if (familyKeys.length === 0) {
        if (pinned) closePinnedPreviews();
        else scene.clearHoverPreviews();
        return;
      }
      const cached = previewCacheRef.current.get(target);
      if (cached) {
        if (cached.length === 0) {
          if (pinned) closePinnedPreviews();
          else scene.clearHoverPreviews();
          return;
        }
        scene.setHoverPreviewFamilies(cached, { pinned });
        return;
      }
      void (async () => {
        const previews: Array<{
          familyKey: string;
          label: string;
          color: string;
          orbitIndex: number;
          trajectory: [number, number, number][];
        }> = [];
        const familyMeta = await fetch(`${API_URL}/families`)
          .then((r) => r.json())
          .catch(() => ({}));
        const availableKeys = new Set(Object.keys(familyMeta));
        for (const familyKey of familyKeys.filter((key) => availableKeys.has(key))) {
          try {
            const res = await fetch(`${API_URL}/family/${familyKey}?n=1`);
            if (!res.ok) continue;
            const data = (await res.json()) as {
              label: string;
              orbits: Array<{ trajectory: [number, number, number][]; index: number }>;
            };
            const orbit = data.orbits[0];
            if (!orbit) continue;
            const meta = familyMeta[familyKey] as { color?: string } | undefined;
            previews.push({
              familyKey,
              label: data.label ?? familyKey,
              color: meta?.color ?? "#AADDFF",
              orbitIndex: orbit.index,
              trajectory: orbit.trajectory,
            });
          } catch (err) {
            console.warn("Preview failed:", familyKey, err);
          }
        }
        previewCacheRef.current.set(target, previews);
        if (pinned && pinnedPreviewAnchorRef.current !== target) return;
        if (!pinned && pinnedPreviewAnchorRef.current) return;
        if (previews.length === 0) {
          if (pinned) closePinnedPreviews();
          else scene.clearHoverPreviews();
          return;
        }
        scene.setHoverPreviewFamilies(previews, { pinned });
      })();
    },
    [closePinnedPreviews],
  );

  const handleHoverTargetChange = useCallback(
    (target: string | null) => {
      const scene = sceneRef.current;
      if (!scene || pinnedPreviewAnchorRef.current) return;
      if (!target) {
        scene.clearHoverPreviews();
        return;
      }
      showPreviewFamiliesForAnchor(target, false);
    },
    [showPreviewFamiliesForAnchor],
  );

  const handlePreviewAnchorClick = useCallback(
    (target: string) => {
      if (target === "Earth" || target === "Moon") {
        setSceneSelection({ type: "body", key: target.toLowerCase() as "earth" | "moon" });
      } else if (/^L[1-5]$/.test(target)) {
        setSceneSelection({
          type: "lagrange",
          key: target.toLowerCase() as "l1" | "l2" | "l3" | "l4" | "l5",
        });
      }
      pinnedPreviewAnchorRef.current = target;
      setPinnedPreviewAnchor(target);
      showPreviewFamiliesForAnchor(target, true);
    },
    [showPreviewFamiliesForAnchor],
  );

  const handlePreviewFamilyClick = useCallback(
    (familyKey: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      void (async () => {
        const [familyRes, familiesRes] = await Promise.all([
          fetch(`${API_URL}/family/${familyKey}?n=20`),
          fetch(`${API_URL}/families`),
        ]);
        if (!familyRes.ok) return;
        const data = (await familyRes.json()) as {
          orbits: Array<{
            trajectory: [number, number, number][];
            jacobi: number;
            period_tu: number;
            period_days: number;
            stability: number;
            index: number;
          }>;
        };
        const familyMeta = await familiesRes.json().catch(() => ({}));
        const meta = familyMeta[familyKey] as
          | { color?: string; jacobi_min?: number; jacobi_max?: number }
          | undefined;
        if (data.orbits.length === 0) return;
        scene.addFamilyOrbits(
          data.orbits,
          meta?.color ?? "#AADDFF",
          meta?.jacobi_min ?? Math.min(...data.orbits.map((o) => o.jacobi)),
          meta?.jacobi_max ?? Math.max(...data.orbits.map((o) => o.jacobi)),
          familyKey,
        );
        setSceneSelection({ type: "family", familyKey, familyName: familyKey });
        closePinnedPreviews();
      })();
    },
    [closePinnedPreviews],
  );

  const handleEmptySceneClick = useCallback(() => {
    if (pinnedPreviewAnchorRef.current) closePinnedPreviews();
  }, [closePinnedPreviews]);

  const handleSaveScene = useCallback(() => {
    const state = buildSavedSceneStateFromAppState({
      system: selectedSystem.id,
      plottedItems,
      selectedAnchor: pinnedPreviewAnchor,
      camera: sceneRef.current?.getCameraState() ?? undefined,
    });
    const key = serializeSceneState(state);
    setSceneKey(key);
    setSceneKeyCopied(false);
    void navigator.clipboard?.writeText(key).then(
      () => setSceneKeyCopied(true),
      () => setSceneKeyCopied(false),
    );
  }, [pinnedPreviewAnchor, plottedItems, selectedSystem.id]);

  const copySceneKey = useCallback(() => {
    if (!sceneKey) return;
    void navigator.clipboard?.writeText(sceneKey).then(() => setSceneKeyCopied(true));
  }, [sceneKey]);

  const handlePlotCustomTrajectory = useCallback(
    async (config: CustomTrajectoryConfig): Promise<number> => {
      const res = await fetch(`${API_URL}/trajectory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: selectedSystem.id,
          state0: config.state0,
          t_span: config.tSpan,
          n_points: config.nPoints,
          direction: config.direction,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(err?.detail ?? `Trajectory request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        trajectory: [number, number, number][];
        jacobi: number;
        t_span: number;
        n_points: number;
        direction: "forward" | "backward";
        state0: [number, number, number, number, number, number];
      };
      const id = sceneRef.current?.addTrajectory(data.trajectory, "#44FF88", config.label, {
        itemType: "custom-trajectory",
        jacobi: data.jacobi,
        sourceKey: "custom-trajectory",
        serializable: {
          kind: "customTrajectory",
          label: config.label,
          state0: data.state0,
          tSpan: data.t_span,
          nPoints: data.n_points,
          direction: data.direction,
          jacobi: data.jacobi,
        },
      });
      if (config.animate) sceneRef.current?.animateSpacecraft(data.trajectory, data.t_span);
      if (id) {
        setSceneSelection({
          type: "customTrajectory",
          id,
          label: config.label,
          jacobi: data.jacobi,
        });
      }
      return data.jacobi;
    },
    [selectedSystem.id],
  );

  void labelsVisible;

  return (
    <main
      className="manifold-root"
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      <SceneContainer
        ref={(api) => {
          (sceneRef as React.MutableRefObject<SceneAPI | null>).current = api;
          if (api && !sceneAPI) setSceneAPI(api);
        }}
        onTrajectoryClick={handleOrbitClick}
        onSceneItemsChange={setPlottedItems}
        onHoverTargetChange={handleHoverTargetChange}
        onPreviewAnchorClick={handlePreviewAnchorClick}
        onPreviewFamilyClick={handlePreviewFamilyClick}
        onEmptySceneClick={handleEmptySceneClick}
      />

      <SearchBar
        onSelectSystem={handleSearchSelectSystem}
        onSelectFamily={handleSearchSelectFamily}
        onShowConcept={handleShowConcept}
      />

      <InfoPanel
        explanation={explanation}
        suggestedNext={suggestedNext}
        isThinking={isThinking}
        onSuggestionClick={handleSuggestionClick}
        conceptContent={conceptContent}
        selection={sceneSelection}
      />

      <SceneControls
        onSaveScene={handleSaveScene}
        onClearTrajectories={() => {
          sceneRef.current?.clearTrajectories();
          setMissionActive(false);
          setMissionLegs([]);
          setLastOrbitMeta(null);
          setPlannerDep(null);
          setPlannerArr(null);
          closePinnedPreviews();
          setSceneSelection({ type: "default" });
        }}
        onToggleLabels={handleToggleLabels}
        onMission={() => setMissionOpen((prev) => !prev)}
      />

      <FamilyBrowserPanel
        scene={sceneAPI}
        onShowManifolds={(familyKey, orbitIndex) => void handleShowManifolds(familyKey, orbitIndex)}
      />

      <SystemControlPanel
        selectedSystem={selectedSystem}
        preSelectedFamilyId={preSelectedFamilyId}
        onVisualize={(params) => void handleVisualize(params)}
        isLoading={isLoading}
        lastOrbitMeta={lastOrbitMeta}
      />

      <SystemMiniMap
        systems={ACTIVE_SYSTEMS}
        selectedSystem={selectedSystem}
        onSystemChange={handleSystemChange}
      />

      <PlottedItemsPanel
        items={plottedItems}
        scene={sceneAPI}
        apiUrl={API_URL}
        onSelectionChange={setSceneSelection}
        onClearAll={() => {
          sceneRef.current?.clearTrajectories();
          setMissionActive(false);
          setMissionLegs([]);
          setPlannerDep(null);
          setPlannerArr(null);
          closePinnedPreviews();
          setSceneSelection({ type: "default" });
        }}
      />

      <TrajectoryInputPanel onPlot={handlePlotCustomTrajectory} />

      {sceneKey && (
        <div
          className="manifold-panel"
          style={{
            position: "fixed",
            top: 24,
            right: 224,
            width: 360,
            maxWidth: "calc(100vw - 48px)",
            zIndex: 30,
            padding: "14px 16px",
            color: "#e0eeff",
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
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
            <span style={{ color: "#00ffff", letterSpacing: "0.16em", fontSize: 10 }}>
              SCENE KEY
            </span>
            <button
              className="manifold-icon-btn"
              onClick={() => setSceneKey(null)}
              aria-label="Close scene key"
              style={{ padding: "4px 6px" }}
            >
              ×
            </button>
          </div>
          <div style={{ color: "rgba(180,200,220,0.65)", lineHeight: 1.5, marginBottom: 10 }}>
            Stores the visible orbit and manifold setup in a URL-safe key. No account or database.
          </div>
          <textarea
            readOnly
            value={sceneKey}
            className="manifold-input"
            style={{
              width: "100%",
              minHeight: 86,
              resize: "vertical",
              padding: 8,
              lineHeight: 1.4,
              fontSize: 10,
            }}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="manifold-icon-btn"
            onClick={copySceneKey}
            style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
          >
            {sceneKeyCopied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {selectedTrajectory && (
        <TrajectoryInfoPanel
          meta={selectedTrajectory}
          onClose={() => setSelectedTrajectory(null)}
          onShowManifolds={handleManifoldFromMeta}
        />
      )}

      {((missionActive && missionLegs.length > 0) || missionOpen) && (
        <MissionPanel
          legs={missionLegs}
          totalDuration={missionDuration}
          onClose={() => {
            setMissionActive(false);
            setMissionOpen(false);
          }}
          selectedSystem={selectedSystem}
          onMissionResult={(result) => {
            type RawMission = {
              legs: Array<{
                label: string;
                type: string;
                color: string;
                duration: number;
                trajectory: [number, number, number][];
              }>;
              total_trajectory: [number, number, number][];
              total_duration: number;
            };
            const r = result as RawMission;
            const scene = sceneRef.current;
            if (!scene || !r?.legs) return;
            for (const leg of r.legs) {
              if (!leg.trajectory || leg.trajectory.length === 0) continue;
              scene.addTrajectory(leg.trajectory, leg.color, leg.label, {
                family: leg.type,
                itemType: leg.type.includes("manifold")
                  ? leg.type.includes("arrival")
                    ? "stable-manifold"
                    : "unstable-manifold"
                  : "mission",
                sourceKey: "mission-builder",
              });
            }
            setMissionLegs(
              r.legs.map((l) => ({
                label: l.label,
                type: l.type,
                color: l.color,
                duration: l.duration,
              })),
            );
            setMissionDuration(r.total_duration ?? 0);
            setMissionActive(true);
            if (r.total_trajectory?.length > 0)
              scene.animateSpacecraft(r.total_trajectory, r.total_duration ?? 10);
          }}
        />
      )}

      {activeControlFamily && (
        <FamilyControlsBar
          familyMeta={activeControlFamily}
          scene={sceneAPI}
          onShowManifolds={(familyKey, orbitIndex) =>
            void handleShowManifolds(familyKey, orbitIndex)
          }
          onClose={() => setActiveControlFamily(null)}
        />
      )}

      <TransferPlannerPanel
        active={plannerActive}
        departure={plannerDep}
        arrival={plannerArr}
        onActivate={() => {
          setPlannerActive(true);
          setPlannerDep(null);
          setPlannerArr(null);
          setSelectedTrajectory(null);
        }}
        onDeactivate={() => {
          setPlannerActive(false);
          setPlannerDep(null);
          setPlannerArr(null);
          sceneRef.current?.setMissionSelectHighlight([]);
        }}
        onClearSelection={() => {
          setPlannerDep(null);
          setPlannerArr(null);
          sceneRef.current?.setMissionSelectHighlight([]);
        }}
        onTransferResult={handleTransferResult}
      />
    </main>
  );
}

function _extractMission(
  cmd: AgentCommand,
  setLegs: (legs: MissionLeg[]) => void,
  setDuration: (d: number) => void,
  setActive: (a: boolean) => void,
) {
  if (cmd.action !== "design_mission" || !cmd.data?.legs) return;
  const legs = cmd.data.legs as MissionLeg[];
  setLegs(legs);
  setDuration((cmd.data.total_duration as number | undefined) ?? 0);
  setActive(true);
}

function _parseFamilyKey(key: string): {
  family: string;
  libr: number | null;
  branch: string | null;
} {
  // e.g. "halo_L2_N" → {family:"halo", libr:2, branch:"N"}
  //      "lyapunov_L1" → {family:"lyapunov", libr:1, branch:null}
  //      "butterfly_N" → {family:"butterfly", libr:null, branch:"N"}
  //      "dragonfly_S" → {family:"dragonfly", libr:null, branch:"S"}
  const parts = key.split("_");
  const family = parts[0];
  let libr: number | null = null;
  let branch: string | null = null;

  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith("L") && /^\d+$/.test(parts[i].slice(1))) {
      libr = parseInt(parts[i].slice(1), 10);
    } else if (parts[i] === "N" || parts[i] === "S") {
      branch = parts[i];
    }
  }
  return { family, libr, branch };
}

function _buildFamilyKey(
  family: string | undefined,
  libr: number | null | undefined,
  branch: string | null | undefined,
): string {
  const parts = [family ?? "unknown"];
  if (libr != null) parts.push(`L${libr}`);
  if (branch) parts.push(branch);
  return parts.join("_");
}

function _previewFamiliesForTarget(target: string): string[] {
  switch (target) {
    case "L1":
      return ["lyapunov_L1", "halo_L1_N", "halo_L1_S", "axial_L1", "vertical_L1"];
    case "L2":
      return ["lyapunov_L2", "halo_L2_N", "halo_L2_S", "axial_L2", "vertical_L2"];
    case "L3":
      return ["lyapunov_L3", "halo_L3_N", "halo_L3_S", "axial_L3", "vertical_L3"];
    case "Moon":
      return ["distant_retrograde", "distant_prograde", "low_prograde_E", "low_prograde_W"];
    case "Earth":
    default:
      return [];
  }
}
