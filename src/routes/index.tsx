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
import type { VisualizeParams } from "@/components/manifold/SystemControlPanel";
import { SearchBar } from "@/components/manifold/SearchBar";
import {
  buildSavedSceneStateFromAppState,
  deserializeSceneState,
  serializeSceneState,
  type SavedSceneState,
} from "@/utils/sceneSerialization";
import {
  clearAutosavedScene,
  loadAutosavedScene,
  saveAutosavedScene,
} from "@/utils/scenePersistence";
import { selectionFromTrajectory, type SceneSelection } from "@/data/educationalContent";
import { MANIFOLD_COLORS } from "@/components/manifold/constants";

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
  const [plottedItems, setPlottedItems] = useState<PlottedSceneItem[]>([]);
  const [sceneSelection, setSceneSelection] = useState<SceneSelection>({ type: "default" });
  const [pinnedPreviewAnchor, setPinnedPreviewAnchor] = useState<string | null>(null);
  const pinnedPreviewAnchorRef = useRef<string | null>(null);
  const [sceneKey, setSceneKey] = useState<string | null>(null);
  const [sceneKeyCopied, setSceneKeyCopied] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const restoreAttemptedRef = useRef(false);
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
                manifoldSettings: { nBranches: 80, propagationTime: 3.0 },
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
                manifoldSettings: { nBranches: 20, propagationTime: 3.0 },
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
  const handleTransferResult = useCallback(
    (result: TransferResult) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const transfer =
        plannerDep?.familyKey && plannerArr?.familyKey
          ? {
              departureFamilyKey: plannerDep.familyKey,
              departureOrbitIndex: plannerDep.orbitIndex ?? 0,
              departureLabel: plannerDep.label,
              arrivalFamilyKey: plannerArr.familyKey,
              arrivalOrbitIndex: plannerArr.orbitIndex ?? 0,
              arrivalLabel: plannerArr.label,
              system: selectedSystem.id,
            }
          : undefined;
      for (const seg of result.segments) {
        const lower = seg.label.toLowerCase();
        scene.addTrajectory(seg.trajectory, seg.color, seg.label, {
          itemType: lower.includes("unstable")
            ? "unstable-manifold"
            : lower.includes("stable")
              ? "stable-manifold"
              : "mission",
          sourceKey: "mission-transfer",
          serializable: {
            kind: "transferSegment",
            label: seg.label,
            segmentType: seg.type,
            transfer,
          },
        });
      }
      if (result.closest_approach_points?.departure) {
        scene.addMarker(result.closest_approach_points.departure, "#FFFF00", "Closest approach", {
          sourceKey: "mission-transfer",
          serializable: { kind: "transferClosestApproach", transfer },
        });
      }
      if (result.total_trajectory.length > 0) {
        scene.animateSpacecraft(result.total_trajectory, result.total_duration_tu);
      }
    },
    [plannerArr, plannerDep, selectedSystem.id],
  );

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

  const clearPlottedScene = useCallback(() => {
    sceneRef.current?.clearTrajectories();
    clearAutosavedScene();
    setMissionActive(false);
    setMissionLegs([]);
    setLastOrbitMeta(null);
    setPlannerDep(null);
    setPlannerArr(null);
    setActiveControlFamily(null);
    closePinnedPreviews();
    setSceneSelection({ type: "default" });
  }, [closePinnedPreviews]);

  const handleSaveScene = useCallback(() => {
    const state = buildSavedSceneStateFromAppState({
      system: selectedSystem.id,
      plottedItems,
      selectedAnchor: pinnedPreviewAnchor,
      camera: sceneRef.current?.getCameraState() ?? undefined,
    });
    const key = serializeSceneState(state);
    saveAutosavedScene(state);
    setSceneKey(key);
    setSceneKeyCopied(false);
    void navigator.clipboard?.writeText(key).then(
      () => setSceneKeyCopied(true),
      () => setSceneKeyCopied(false),
    );
  }, [pinnedPreviewAnchor, plottedItems, selectedSystem.id]);

  const handleLoadSceneKey = useCallback(
    async (key: string): Promise<string[]> => {
      const scene = sceneRef.current;
      if (!scene) throw new Error("Scene is not ready yet.");

      let state: SavedSceneState;
      try {
        state = deserializeSceneState(key);
      } catch {
        throw new Error("Invalid scene key. Check that you copied the entire key.");
      }
      if (state.system !== EARTH_MOON_SYSTEM.id) {
        throw new Error("This scene key is for a system this app does not currently load.");
      }

      clearPlottedScene();
      setSelectedSystem(EARTH_MOON_SYSTEM);
      setSceneTransform([0, 0, 0], 1.0);
      scene.updateSystemBodies({
        ...EARTH_MOON_SYSTEM.bodyConfig,
        primaryScenePos: EARTH_MOON_SYSTEM.sceneConfig.primaryScenePos,
        secondaryScenePos: EARTH_MOON_SYSTEM.sceneConfig.secondaryScenePos,
      });
      scene.updateLagrangePoints(transformedLagrangePoints(EARTH_MOON_SYSTEM));
      scene.setBackgroundPlanets(BACKGROUND_PLANETS);

      const warnings: string[] = [];
      const loadedFamilies = new Set<string>();
      const loadedManifolds = new Set<string>();
      const loadedTransfers = new Set<string>();
      const loadedMissions = new Set<string>();

      const familiesMeta = (await fetch(`${API_URL}/families`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))) as Record<
        string,
        { label?: string; color?: string; jacobi_min?: number; jacobi_max?: number }
      >;

      for (const item of state.plottedItems) {
        try {
          const transfer = "transfer" in item ? item.transfer : undefined;
          const mission = "mission" in item ? item.mission : undefined;
          if (item.type === "mission") {
            if (!mission?.legs?.length) {
              warnings.push(
                `Could not restore mission${
                  item.label ? ` "${item.label}"` : ""
                }: saved key is missing the mission leg sequence.`,
              );
              continue;
            }
            const missionKey = JSON.stringify(mission.legs);
            if (loadedMissions.has(missionKey)) continue;
            loadedMissions.add(missionKey);
            const res = await fetch(`${API_URL}/mission`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                legs: mission.legs,
                system: mission.system ?? EARTH_MOON_SYSTEM.id,
              }),
            });
            if (!res.ok) throw new Error(`mission returned ${res.status}`);
            const r = (await res.json()) as {
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
            const ids: string[] = [];
            for (const leg of r.legs) {
              if (!leg.trajectory?.length) continue;
              ids.push(
                scene.addTrajectory(leg.trajectory, leg.color, leg.label, {
                  family: leg.type,
                  itemType: leg.type.includes("manifold")
                    ? leg.type.includes("arrival")
                      ? "stable-manifold"
                      : "unstable-manifold"
                    : "mission",
                  sourceKey: "mission-builder",
                  serializable: {
                    kind: "missionBuilderSegment",
                    label: leg.label,
                    mission,
                  },
                }),
              );
            }
            setMissionLegs(
              r.legs.map((leg) => ({
                label: leg.label,
                type: leg.type,
                color: leg.color,
                duration: leg.duration,
              })),
            );
            setMissionDuration(r.total_duration ?? 0);
            setMissionActive(true);
            if (r.total_trajectory?.length > 0) {
              scene.animateSpacecraft(r.total_trajectory, r.total_duration ?? 10);
            }
            if (!item.visible)
              ids.filter(Boolean).forEach((id) => scene.setPlottedItemVisible(id, false));
            continue;
          }

          if (item.type === "transfer") {
            if (!transfer) {
              warnings.push(
                `Could not restore transfer${
                  item.label ? ` "${item.label}"` : ""
                }: saved key is missing departure and arrival orbit indices.`,
              );
              continue;
            }
            const transferKey = `${transfer.departureFamilyKey}:${transfer.departureOrbitIndex}->${transfer.arrivalFamilyKey}:${transfer.arrivalOrbitIndex}`;
            if (loadedTransfers.has(transferKey)) continue;
            loadedTransfers.add(transferKey);
            const res = await fetch(`${API_URL}/transfer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                departure_family_key: transfer.departureFamilyKey,
                departure_orbit_index: transfer.departureOrbitIndex,
                arrival_family_key: transfer.arrivalFamilyKey,
                arrival_orbit_index: transfer.arrivalOrbitIndex,
                system: transfer.system ?? EARTH_MOON_SYSTEM.id,
              }),
            });
            if (!res.ok) throw new Error(`transfer returned ${res.status}`);
            const result = (await res.json()) as TransferResult;
            const ids: string[] = [];
            for (const seg of result.segments) {
              const lower = seg.label.toLowerCase();
              ids.push(
                scene.addTrajectory(seg.trajectory, seg.color, seg.label, {
                  itemType: lower.includes("unstable")
                    ? "unstable-manifold"
                    : lower.includes("stable")
                      ? "stable-manifold"
                      : "mission",
                  sourceKey: "mission-transfer",
                  serializable: {
                    kind: "transferSegment",
                    label: seg.label,
                    segmentType: seg.type,
                    transfer,
                  },
                }),
              );
            }
            if (result.closest_approach_points?.departure) {
              ids.push(
                scene.addMarker(
                  result.closest_approach_points.departure,
                  "#FFFF00",
                  "Closest approach",
                  {
                    sourceKey: "mission-transfer",
                    serializable: { kind: "transferClosestApproach", transfer },
                  },
                ),
              );
            }
            if (result.total_trajectory.length > 0) {
              scene.animateSpacecraft(result.total_trajectory, result.total_duration_tu);
            }
            if (!item.visible)
              ids.filter(Boolean).forEach((id) => scene.setPlottedItemVisible(id, false));
            continue;
          }

          if (item.type === "family") {
            const familyKey = item.familyKey ?? item.sourceKey ?? item.id;
            if (!familyKey || loadedFamilies.has(familyKey)) continue;
            loadedFamilies.add(familyKey);
            const res = await fetch(`${API_URL}/family/${familyKey}?n=50`);
            if (!res.ok) throw new Error(`family ${familyKey} returned ${res.status}`);
            const data = (await res.json()) as {
              orbits: Array<{
                trajectory: [number, number, number][];
                jacobi: number;
                period_tu: number;
                period_days: number;
                stability: number;
                index: number;
              }>;
            };
            const meta = familiesMeta[familyKey];
            const jacobis = data.orbits.map((orbit) => orbit.jacobi);
            scene.addFamilyOrbits(
              data.orbits,
              item.color ?? meta?.color ?? "#AADDFF",
              meta?.jacobi_min ?? Math.min(...jacobis),
              meta?.jacobi_max ?? Math.max(...jacobis),
              familyKey,
            );
            if (!item.visible) scene.setPlottedItemVisible(familyKey, false);
            continue;
          }

          if (item.type === "orbit") {
            const familyKey = item.familyKey ?? item.sourceKey;
            if (!familyKey || item.orbitIndex == null) {
              warnings.push(`${item.label ?? "Orbit"} is missing family/index data`);
              continue;
            }
            const parsed = _parseFamilyKey(familyKey);
            const res = await fetch(`${API_URL}/orbit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...parsed,
                index: item.orbitIndex,
                system: EARTH_MOON_SYSTEM.id,
              }),
            });
            if (!res.ok)
              throw new Error(`orbit ${familyKey} #${item.orbitIndex + 1} returned ${res.status}`);
            const data = (await res.json()) as {
              trajectory: [number, number, number][];
              period?: number;
              jacobi?: number;
            };
            const id = scene.addTrajectory(
              data.trajectory,
              item.color ?? familiesMeta[familyKey]?.color ?? "#00FFFF",
              item.label ?? `${familyKey} #${item.orbitIndex + 1}`,
              {
                family: parsed.family,
                familyKey,
                libr: parsed.libr,
                branch: parsed.branch,
                orbitIndex: item.orbitIndex,
                period: data.period,
                jacobi: data.jacobi,
                itemType: "orbit",
                sourceKey: familyKey,
                serializable: { kind: "orbit", familyKey, orbitIndex: item.orbitIndex },
              },
            );
            if (id && !item.visible) scene.setPlottedItemVisible(id, false);
            continue;
          }

          if (item.type === "manifold") {
            const familyKey = item.sourceFamilyKey ?? item.familyKey ?? item.sourceKey;
            if (!familyKey || item.orbitIndex == null) {
              warnings.push(
                item.sourceKey === "mission-transfer"
                  ? `Could not restore transfer segment "${item.label ?? "manifold"}": saved key is missing departure/arrival orbit data.`
                  : `${item.label ?? "Manifold"} is missing source orbit data`,
              );
              continue;
            }
            const manifoldType = item.manifoldType ?? "both";
            const manifoldSettings = "manifoldSettings" in item ? item.manifoldSettings : undefined;
            const key = `${familyKey}:${item.orbitIndex}:${manifoldType}`;
            if (loadedManifolds.has(key)) continue;
            loadedManifolds.add(key);
            const parsed = _parseFamilyKey(familyKey);
            const res = await fetch(`${API_URL}/manifold`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...parsed,
                index: item.orbitIndex,
                type: manifoldType,
                n_branches: manifoldSettings?.nBranches ?? 80,
                propagation_time: manifoldSettings?.propagationTime ?? 3.0,
                system: EARTH_MOON_SYSTEM.id,
              }),
            });
            if (!res.ok)
              throw new Error(
                `manifold ${familyKey} #${item.orbitIndex + 1} returned ${res.status}`,
              );
            const data = (await res.json()) as Record<string, [number, number, number][][]>;
            const ids: string[] = [];
            if (data.unstable_plus) {
              ids.push(
                scene.addManifoldTubes(data.unstable_plus, MANIFOLD_COLORS.unstable, {
                  label: "Unstable manifold (+)",
                  kind: "unstable",
                  sourceKey: familyKey,
                  serializable: {
                    kind: "manifold",
                    manifoldType: "unstable",
                    familyKey,
                    sourceFamilyKey: familyKey,
                    orbitIndex: item.orbitIndex,
                    manifoldSettings: {
                      nBranches: manifoldSettings?.nBranches ?? 80,
                      propagationTime: manifoldSettings?.propagationTime ?? 3.0,
                    },
                  },
                }),
              );
            }
            if (data.unstable_minus) {
              ids.push(
                scene.addManifoldTubes(data.unstable_minus, MANIFOLD_COLORS.unstableMuted, {
                  label: "Unstable manifold (-)",
                  kind: "unstable",
                  sourceKey: familyKey,
                  serializable: {
                    kind: "manifold",
                    manifoldType: "unstable",
                    familyKey,
                    sourceFamilyKey: familyKey,
                    orbitIndex: item.orbitIndex,
                    manifoldSettings: {
                      nBranches: manifoldSettings?.nBranches ?? 80,
                      propagationTime: manifoldSettings?.propagationTime ?? 3.0,
                    },
                  },
                }),
              );
            }
            if (data.stable_plus) {
              ids.push(
                scene.addManifoldTubes(data.stable_plus, MANIFOLD_COLORS.stable, {
                  label: "Stable manifold (+)",
                  kind: "stable",
                  sourceKey: familyKey,
                  serializable: {
                    kind: "manifold",
                    manifoldType: "stable",
                    familyKey,
                    sourceFamilyKey: familyKey,
                    orbitIndex: item.orbitIndex,
                    manifoldSettings: {
                      nBranches: manifoldSettings?.nBranches ?? 80,
                      propagationTime: manifoldSettings?.propagationTime ?? 3.0,
                    },
                  },
                }),
              );
            }
            if (data.stable_minus) {
              ids.push(
                scene.addManifoldTubes(data.stable_minus, MANIFOLD_COLORS.stableMuted, {
                  label: "Stable manifold (-)",
                  kind: "stable",
                  sourceKey: familyKey,
                  serializable: {
                    kind: "manifold",
                    manifoldType: "stable",
                    familyKey,
                    sourceFamilyKey: familyKey,
                    orbitIndex: item.orbitIndex,
                    manifoldSettings: {
                      nBranches: manifoldSettings?.nBranches ?? 80,
                      propagationTime: manifoldSettings?.propagationTime ?? 3.0,
                    },
                  },
                }),
              );
            }
            if (!item.visible)
              ids.filter(Boolean).forEach((id) => scene.setPlottedItemVisible(id, false));
            continue;
          }

          if (item.type === "customTrajectory" && item.customTrajectory) {
            const cfg = item.customTrajectory;
            const res = await fetch(`${API_URL}/trajectory`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system: EARTH_MOON_SYSTEM.id,
                state0: cfg.state0,
                t_span: cfg.tSpan,
                n_points: cfg.nPoints,
                direction: cfg.direction,
              }),
            });
            if (!res.ok) throw new Error(`custom trajectory returned ${res.status}`);
            const data = (await res.json()) as {
              trajectory: [number, number, number][];
              jacobi: number;
            };
            const id = scene.addTrajectory(
              data.trajectory,
              item.color ?? "#44FF88",
              cfg.label ?? item.label ?? "Custom trajectory",
              {
                itemType: "custom-trajectory",
                jacobi: data.jacobi,
                sourceKey: "custom-trajectory",
                serializable: {
                  kind: "customTrajectory",
                  label: cfg.label ?? item.label,
                  state0: cfg.state0,
                  tSpan: cfg.tSpan,
                  nPoints: cfg.nPoints,
                  direction: cfg.direction,
                  jacobi: data.jacobi,
                },
              },
            );
            if (id && !item.visible) scene.setPlottedItemVisible(id, false);
            continue;
          }

          warnings.push(
            `${item.label ?? item.type} cannot be restored from the current scene key schema`,
          );
        } catch (err) {
          warnings.push(
            `${item.label ?? item.type}: ${err instanceof Error ? err.message : "restore failed"}`,
          );
        }
      }

      if (state.camera?.position && state.camera.target) {
        scene.setCameraView(state.camera.position, state.camera.target);
      }
      if (state.selectedAnchor) {
        pinnedPreviewAnchorRef.current = state.selectedAnchor;
        setPinnedPreviewAnchor(state.selectedAnchor);
      }
      setSceneKey(key);
      setSceneKeyCopied(false);
      return warnings;
    },
    [clearPlottedScene],
  );

  React.useEffect(() => {
    if (!sceneAPI || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    const saved = (() => {
      try {
        return loadAutosavedScene();
      } catch {
        clearAutosavedScene();
        return null;
      }
    })();
    if (!saved || saved.state.plottedItems.length === 0) return;
    void handleLoadSceneKey(saved.sceneKey)
      .then((warnings) => {
        setRestoreNotice(
          warnings.length > 0
            ? `Restored previous scene with ${warnings.length} warning(s)`
            : "Restored previous scene",
        );
        window.setTimeout(() => setRestoreNotice(null), 4200);
      })
      .catch(() => {
        setRestoreNotice("Could not restore previous scene");
        window.setTimeout(() => setRestoreNotice(null), 4200);
      });
  }, [handleLoadSceneKey, sceneAPI]);

  React.useEffect(() => {
    if (!sceneAPI || !restoreAttemptedRef.current) return;
    const id = window.setTimeout(() => {
      if (plottedItems.length === 0) {
        clearAutosavedScene();
        return;
      }
      const state = buildSavedSceneStateFromAppState({
        system: selectedSystem.id,
        plottedItems,
        selectedAnchor: pinnedPreviewAnchor,
        camera: sceneRef.current?.getCameraState() ?? undefined,
      });
      saveAutosavedScene(state);
    }, 800);
    return () => window.clearTimeout(id);
  }, [pinnedPreviewAnchor, plottedItems, sceneAPI, selectedSystem.id]);

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

  const handleCustomTrajectoryPreview = useCallback(
    (state0: CustomTrajectoryConfig["state0"] | null) => {
      sceneRef.current?.setCustomTrajectoryPreview(state0);
    },
    [],
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

      <div className="manifold-orientation-overlay" aria-live="polite">
        <div className="manifold-orientation-card">
          <div className="manifold-mono" style={{ color: "var(--manifold-cyan)", fontSize: 13 }}>
            Rotate your device
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.5 }}>
            Manifold is a 3D orbital dynamics explorer and works best in landscape mode.
          </div>
          <div style={{ marginTop: 8, color: "rgba(180,200,220,0.68)", lineHeight: 1.45 }}>
            Turn your phone sideways to explore the Earth-Moon system.
          </div>
        </div>
      </div>

      {restoreNotice && <div className="manifold-toast">{restoreNotice}</div>}

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
        onLoadSceneKey={handleLoadSceneKey}
        onToggleLabels={handleToggleLabels}
        plottedItems={plottedItems}
        scene={sceneAPI}
        apiUrl={API_URL}
        onSelectionChange={setSceneSelection}
        missionContent={
          <>
            <MissionPanel
              embedded
              legs={missionLegs}
              totalDuration={missionDuration}
              onClose={() => {
                setMissionActive(false);
              }}
              selectedSystem={selectedSystem}
              onMissionResult={(result, builderLegs) => {
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
                    serializable: {
                      kind: "missionBuilderSegment",
                      label: leg.label,
                      mission: { legs: builderLegs, system: selectedSystem.id },
                    },
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
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "10px 0" }} />
            <TransferPlannerPanel
              embedded
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
          </>
        }
        customTrajectoryContent={
          <TrajectoryInputPanel
            embedded
            onPlot={handlePlotCustomTrajectory}
            onPreviewChange={handleCustomTrajectoryPreview}
          />
        }
      />

      <FamilyBrowserPanel
        scene={sceneAPI}
        onShowManifolds={(familyKey, orbitIndex) => void handleShowManifolds(familyKey, orbitIndex)}
      />

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
