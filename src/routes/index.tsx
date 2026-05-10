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

      <InfoPanel
        explanation={explanation}
        suggestedNext={suggestedNext}
        isThinking={isThinking}
        onSuggestionClick={handleSuggestionClick}
      />

      <SceneControls
        onResetCamera={() => sceneRef.current?.resetCamera()}
        onClearTrajectories={() => {
          sceneRef.current?.clearTrajectories();
          setMissionActive(false);
          setMissionLegs([]);
        }}
        onToggleLabels={handleToggleLabels}
      />

      <ChatInput
        value={chatInput}
        onChange={setChatInput}
        onSubmit={handleSubmit}
        isThinking={isThinking}
      />

      <FamilyBrowserPanel
        scene={sceneAPI}
        onShowManifolds={(familyKey, orbitIndex) => void handleShowManifolds(familyKey, orbitIndex)}
      />

      {selectedTrajectory && (
        <TrajectoryInfoPanel
          meta={selectedTrajectory}
          onClose={() => setSelectedTrajectory(null)}
          onShowManifolds={handleManifoldFromMeta}
        />
      )}

      {missionActive && missionLegs.length > 0 && (
        <MissionPanel
          legs={missionLegs}
          totalDuration={missionDuration}
          onClose={() => setMissionActive(false)}
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
