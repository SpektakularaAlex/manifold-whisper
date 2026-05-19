import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useRef, useState } from "react";
import axios from "axios";
import { SceneContainer, type SceneAPI, type TrajectoryMeta } from "@/components/manifold/SceneContainer";
import { InfoPanel } from "@/components/manifold/InfoPanel";
import { ChatInput } from "@/components/manifold/ChatInput";
import { SceneControls } from "@/components/manifold/SceneControls";
import { TrajectoryInfoPanel } from "@/components/manifold/TrajectoryInfoPanel";
import { MissionPanel, type MissionLeg } from "@/components/manifold/MissionPanel";
import { FamilyBrowserPanel } from "@/components/manifold/FamilyBrowserPanel";
import { TransferPlannerPanel, type TransferResult } from "@/components/manifold/TransferPlannerPanel";
import { FamilyControlsBar } from "@/components/manifold/FamilyControlsBar";
import { useAgent } from "@/hooks/useAgent";
import { executeCommand, type FamilyShownMeta } from "@/utils/sceneCommands";
import type { AgentCommand } from "@/hooks/useAgent";
import { SYSTEMS, type CRSystem, type SearchEntry } from "@/data/systems";
import { SystemControlPanel, type VisualizeParams } from "@/components/manifold/SystemControlPanel";
import { SearchBar } from "@/components/manifold/SearchBar";
import { SystemMiniMap } from "@/components/manifold/SystemMiniMap";

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
  const [selectedSystem, setSelectedSystem] = useState<CRSystem>(SYSTEMS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastOrbitMeta, setLastOrbitMeta] = useState<{ period?: number; jacobi?: number; totalMembers?: number } | null>(null);
  const [preSelectedFamilyId, setPreSelectedFamilyId] = useState<string | null>(null);
  const [conceptContent, setConceptContent] = useState<SearchEntry | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);

  const handleSubmit = useCallback(async (message: string) => {
    setChatInput("");
    const commands = await submit(message);
    if (!sceneRef.current) return;
    for (const cmd of commands) {
      executeCommand(cmd, sceneRef.current, setActiveControlFamily);
      _extractMission(cmd, setMissionLegs, setMissionDuration, setMissionActive);
    }
  }, [submit]);

  const handleSuggestionClick = useCallback((s: string) => {
    void handleSubmit(s);
  }, [handleSubmit]);

  const handleToggleLabels = useCallback(() => {
    setLabelsVisible((prev) => {
      const next = !prev;
      sceneRef.current?.showLagrangePoints(next);
      return next;
    });
  }, []);

  // Show manifolds for a clicked/family orbit
  const handleShowManifolds = useCallback(async (familyKey: string, orbitIndex: number) => {
    // Parse familyKey back into family/libr/branch for the manifold endpoint
    const parsed = _parseFamilyKey(familyKey);
    try {
      const res = await axios.post(`${API_URL}/manifold`, {
        ...parsed,
        index:      orbitIndex,
        type:       "unstable",
        n_branches: 80,
      });
      if (sceneRef.current) {
        const cmd: AgentCommand = { action: "show_manifold", data: res.data };
        executeCommand(cmd, sceneRef.current);
      }
    } catch (err) {
      console.error("Manifold computation failed:", err);
    }
  }, []);

  // Handler passed to TrajectoryInfoPanel's Show Manifolds button
  const handleManifoldFromMeta = useCallback((meta: TrajectoryMeta) => {
    const familyKey = meta.familyKey ?? _buildFamilyKey(meta.family, meta.libr, meta.branch);
    void handleShowManifolds(familyKey, meta.orbitIndex ?? 0);
  }, [handleShowManifolds]);

  const handleVisualize = useCallback(async (params: VisualizeParams) => {
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
      const orbitData = await orbitRes.json() as { trajectory: [number, number, number][]; period?: number; jacobi?: number; total_members?: number };
      const famMeta = selectedSystem.families.find(f => f.id === family);
      const orbitColor = famMeta?.color ?? "#00FFFF";
      sceneRef.current.addTrajectory(orbitData.trajectory, orbitColor, `${famMeta?.label ?? family} #${index + 1}`, {});
      setLastOrbitMeta({ period: orbitData.period, jacobi: orbitData.jacobi, totalMembers: orbitData.total_members });
      if (showManifolds !== "none") {
        const mRes = await fetch(`${API_URL}/manifold`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ family, libr, branch, index, type: showManifolds, system: systemId, n_branches: 20, propagation_time: 3.0 }),
        });
        if (!mRes.ok) throw new Error(`Manifold ${mRes.status}`);
        const mData = await mRes.json();
        const cmd: AgentCommand = { action: "show_manifold", data: mData };
        executeCommand(cmd, sceneRef.current);
      }
    } catch (err) {
      console.error("Visualize failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSystem]);

  const handleSystemChange = useCallback((system: CRSystem) => {
    setSelectedSystem(system);
    sceneRef.current?.clearTrajectories();
    sceneRef.current?.updateSystemBodies(system.bodyConfig);
    sceneRef.current?.updateLagrangePoints(system.lagrangePoints);
    sceneRef.current?.showLagrangePoints(false);
    setLastOrbitMeta(null);
    setPreSelectedFamilyId(null);
    setConceptContent(null);
  }, []);

  // Apply Earth-Moon body config once the scene is ready
  React.useEffect(() => {
    if (sceneAPI) {
      sceneAPI.updateSystemBodies(SYSTEMS[0].bodyConfig);
      sceneAPI.updateLagrangePoints(SYSTEMS[0].lagrangePoints);
    }
  }, [sceneAPI]);

  const handleSearchSelectSystem = useCallback((systemId: string) => {
    const sys = SYSTEMS.find(s => s.id === systemId);
    if (sys) handleSystemChange(sys);
  }, [handleSystemChange]);

  const handleSearchSelectFamily = useCallback((systemId: string, familyId: string) => {
    const sys = SYSTEMS.find(s => s.id === systemId);
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
  const handleOrbitClick = useCallback((meta: TrajectoryMeta) => {
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
  }, [plannerActive, plannerDep, plannerArr]);

  // Renders transfer result segments and animates spacecraft
  const handleTransferResult = useCallback((result: TransferResult) => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.clearTrajectories();
    for (const seg of result.segments) {
      scene.addTrajectory(seg.trajectory, seg.color, seg.label, {});
    }
    if (result.total_trajectory.length > 0) {
      scene.animateSpacecraft(result.total_trajectory, result.total_duration_tu);
    }
  }, []);

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
        systemInfo={conceptContent ? null : selectedSystem}
        conceptContent={conceptContent}
      />

      <SceneControls
        onResetCamera={() => sceneRef.current?.resetCamera()}
        onClearTrajectories={() => {
          sceneRef.current?.clearTrajectories();
          setMissionActive(false);
          setMissionLegs([]);
          setLastOrbitMeta(null);
        }}
        onToggleLabels={handleToggleLabels}
        onMission={() => setMissionOpen(prev => !prev)}
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
        systems={SYSTEMS}
        selectedSystem={selectedSystem}
        onSystemChange={handleSystemChange}
      />

      {selectedTrajectory && (
        <TrajectoryInfoPanel
          meta={selectedTrajectory}
          onClose={() => setSelectedTrajectory(null)}
          onShowManifolds={handleManifoldFromMeta}
        />
      )}

      {(missionActive && missionLegs.length > 0 || missionOpen) && (
        <MissionPanel
          legs={missionLegs}
          totalDuration={missionDuration}
          onClose={() => { setMissionActive(false); setMissionOpen(false); }}
          selectedSystem={selectedSystem}
          onMissionResult={(result) => {
            type RawMission = {
              legs: Array<{ label: string; type: string; color: string; duration: number; trajectory: [number, number, number][] }>;
              total_trajectory: [number, number, number][];
              total_duration: number;
            };
            const r = result as RawMission;
            const scene = sceneRef.current;
            if (!scene || !r?.legs) return;
            scene.clearTrajectories();
            for (const leg of r.legs) {
              if (!leg.trajectory || leg.trajectory.length === 0) continue;
              scene.addTrajectory(leg.trajectory, leg.color, leg.label, { family: leg.type });
            }
            setMissionLegs(r.legs.map(l => ({ label: l.label, type: l.type, color: l.color, duration: l.duration })));
            setMissionDuration(r.total_duration ?? 0);
            setMissionActive(true);
            if (r.total_trajectory?.length > 0) scene.animateSpacecraft(r.total_trajectory, r.total_duration ?? 10);
          }}
        />
      )}

      {activeControlFamily && (
        <FamilyControlsBar
          familyMeta={activeControlFamily}
          scene={sceneAPI}
          onShowManifolds={(familyKey, orbitIndex) => void handleShowManifolds(familyKey, orbitIndex)}
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

function _parseFamilyKey(key: string): { family: string; libr: number | null; branch: string | null } {
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
