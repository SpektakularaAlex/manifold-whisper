import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { SceneContainer, type SceneAPI, type TrajectoryMeta } from "@/components/manifold/SceneContainer";
import { InfoPanel } from "@/components/manifold/InfoPanel";
import { ChatInput } from "@/components/manifold/ChatInput";
import { SceneControls } from "@/components/manifold/SceneControls";
import { TrajectoryInfoPanel } from "@/components/manifold/TrajectoryInfoPanel";
import { MissionPanel, type MissionLeg } from "@/components/manifold/MissionPanel";
import { useAgent } from "@/hooks/useAgent";
import { executeCommand } from "@/utils/sceneCommands";
import type { AgentCommand } from "@/hooks/useAgent";

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
  const [chatInput, setChatInput] = useState("");
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [selectedTrajectory, setSelectedTrajectory] = useState<TrajectoryMeta | null>(null);
  const [missionLegs, setMissionLegs] = useState<MissionLeg[]>([]);
  const [missionDuration, setMissionDuration] = useState(0);
  const [missionActive, setMissionActive] = useState(false);
  const { submit, isThinking, explanation, suggestedNext } = useAgent();

  const handleSubmit = useCallback(async (message: string) => {
    setChatInput("");
    const commands = await submit(message);
    if (!sceneRef.current) return;
    for (const cmd of commands) {
      executeCommand(cmd, sceneRef.current);
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

  void labelsVisible; // consumed via the toggle handler above

  return (
    <main
      className="manifold-root"
      style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}
    >
      <SceneContainer ref={sceneRef} onTrajectoryClick={setSelectedTrajectory} />

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

      {selectedTrajectory && (
        <TrajectoryInfoPanel
          meta={selectedTrajectory}
          onClose={() => setSelectedTrajectory(null)}
        />
      )}

      {missionActive && missionLegs.length > 0 && (
        <MissionPanel
          legs={missionLegs}
          totalDuration={missionDuration}
          onClose={() => setMissionActive(false)}
        />
      )}
    </main>
  );
}

// Pulled out of handleSubmit so it doesn't trigger exhaustive-deps for the setters
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
