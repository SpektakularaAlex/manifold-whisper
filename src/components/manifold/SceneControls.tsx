import { useState } from "react";
import { FolderOpen, Info, Rocket, Save } from "lucide-react";
import type { PlottedSceneItem, SceneAPI } from "@/components/manifold/SceneContainer";
import type { SceneSelection } from "@/data/educationalContent";
import { PlottedItemsPanel } from "./PlottedItemsPanel";

interface SceneControlsProps {
  onSaveScene: () => void;
  onLoadSceneKey?: (sceneKey: string) => Promise<string[] | void> | string[] | void;
  onToggleLabels: () => void;
  onMission?: () => void;
  plottedItems: PlottedSceneItem[];
  scene: SceneAPI | null;
  apiUrl: string;
  onSelectionChange?: (selection: SceneSelection) => void;
}

export function SceneControls({
  onSaveScene,
  onLoadSceneKey,
  onToggleLabels,
  onMission,
  plottedItems,
  scene,
  apiUrl,
  onSelectionChange,
}: SceneControlsProps) {
  const [loadOpen, setLoadOpen] = useState(false);
  const [sceneKeyInput, setSceneKeyInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [isLoadingScene, setIsLoadingScene] = useState(false);

  const submitLoad = async () => {
    const key = sceneKeyInput.trim();
    if (!key) {
      setLoadError("Paste a scene key first.");
      return;
    }
    if (!onLoadSceneKey) return;
    setIsLoadingScene(true);
    setLoadError(null);
    setLoadNotice(null);
    try {
      const warnings = await onLoadSceneKey(key);
      if (warnings && warnings.length > 0) {
        setLoadNotice(`Loaded with warnings: ${warnings.join("; ")}`);
      } else {
        setSceneKeyInput("");
        setLoadOpen(false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load that scene key.");
    } finally {
      setIsLoadingScene(false);
    }
  };

  return (
    <div
      className="manifold-panel manifold-fade-in manifold-delay-2"
      style={{
        position: "absolute",
        top: 24,
        right: 24,
        width: 260,
        maxHeight: "calc(100vh - 48px)",
        padding: "14px 14px",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
      }}
    >
      <div
        className="manifold-mono"
        style={{ color: "var(--manifold-cyan)", fontSize: 10, letterSpacing: "0.3em" }}
      >
        SCENE
      </div>
      <button className="manifold-icon-btn" onClick={onSaveScene}>
        <Save size={12} /> <span>Save Scene</span>
      </button>
      <button className="manifold-icon-btn" onClick={() => setLoadOpen((prev) => !prev)}>
        <FolderOpen size={12} /> <span>Load Scene</span>
      </button>
      {loadOpen && (
        <div
          style={{
            border: "1px solid rgba(0,255,255,0.16)",
            padding: 8,
            background: "rgba(0,8,14,0.65)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <textarea
            className="manifold-input"
            value={sceneKeyInput}
            onChange={(event) => setSceneKeyInput(event.target.value)}
            placeholder="Paste scene key"
            style={{
              width: "100%",
              minHeight: 70,
              resize: "vertical",
              padding: 7,
              fontSize: 10,
              lineHeight: 1.35,
            }}
          />
          {loadError && <div style={{ color: "#ff8866", fontSize: 10 }}>{loadError}</div>}
          {loadNotice && <div style={{ color: "#ffb36b", fontSize: 10 }}>{loadNotice}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button
              className="manifold-icon-btn"
              onClick={() => {
                setLoadOpen(false);
                setLoadError(null);
              }}
              style={{ justifyContent: "center" }}
            >
              Cancel
            </button>
            <button
              className="manifold-icon-btn"
              onClick={() => void submitLoad()}
              disabled={isLoadingScene}
              style={{ justifyContent: "center" }}
            >
              {isLoadingScene ? "Loading" : "Load"}
            </button>
          </div>
        </div>
      )}
      <button className="manifold-icon-btn" onClick={onToggleLabels}>
        <Info size={12} /> <span>Lagrange Points</span>
      </button>
      {onMission && (
        <button className="manifold-icon-btn" onClick={onMission}>
          <Rocket size={12} /> <span>Mission Builder</span>
        </button>
      )}
      <div style={{ height: 1, background: "rgba(0,255,255,0.16)", margin: "2px 0" }} />
      <PlottedItemsPanel
        embedded
        items={plottedItems}
        scene={scene}
        apiUrl={apiUrl}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}
