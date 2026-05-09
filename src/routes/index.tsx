import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { SceneContainer } from "@/components/manifold/SceneContainer";
import { InfoPanel } from "@/components/manifold/InfoPanel";
import { ChatInput } from "@/components/manifold/ChatInput";
import { SceneControls } from "@/components/manifold/SceneControls";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MANIFOLD — Cislunar Dynamics Explorer" },
      { name: "description", content: "Explore cislunar orbital dynamics through natural language. An interactive 3D space visualization tool." },
    ],
  }),
});

function Index() {
  const [explanation, setExplanation] = useState("");
  const [suggestedNext, setSuggestedNext] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const handleSubmit = useCallback((message: string) => {
    console.log("Agent query:", message);
    setChatInput("");
    setIsThinking(true);
    // TODO: wire to useAgent hook in VS Code
  }, []);

  const handleSuggestionClick = useCallback((s: string) => {
    setChatInput(s);
  }, []);

  // Silence unused-setter warnings — these are wired by external logic later.
  void setExplanation;
  void setSuggestedNext;
  void setIsThinking;

  return (
    <main className="manifold-root" style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <SceneContainer />
      <InfoPanel
        explanation={explanation}
        suggestedNext={suggestedNext}
        isThinking={isThinking}
        onSuggestionClick={handleSuggestionClick}
      />
      <SceneControls
        onResetCamera={() => console.log("reset camera")}
        onClearTrajectories={() => console.log("clear trajectories")}
        onToggleLabels={() => console.log("toggle labels")}
      />
      <ChatInput
        value={chatInput}
        onChange={setChatInput}
        onSubmit={handleSubmit}
        isThinking={isThinking}
      />
    </main>
  );
}
