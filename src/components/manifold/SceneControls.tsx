import { useState } from "react";
import type { ReactNode } from "react";
import { FolderOpen, Info, Menu, Orbit, Rocket, Save, X } from "lucide-react";
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
  missionContent?: ReactNode;
  customTrajectoryContent?: ReactNode;
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
  missionContent,
  customTrajectoryContent,
}: SceneControlsProps) {
  const [loadOpen, setLoadOpen] = useState(false);
  const [openTool, setOpenTool] = useState<"mission" | "trajectory" | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
        const shown = warnings.slice(0, 2).join("; ");
        const remaining = warnings.length > 2 ? `; ${warnings.length - 2} more` : "";
        setLoadNotice(`Scene loaded with ${warnings.length} warning(s): ${shown}${remaining}`);
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
    <>
      <button
        className="manifold-mobile-menu-btn manifold-icon-btn"
        onClick={() => setDrawerOpen((prev) => !prev)}
        aria-label={drawerOpen ? "Close scene controls" : "Open scene controls"}
      >
        {drawerOpen ? <X size={15} /> : <Menu size={15} />}
      </button>
      {drawerOpen && (
        <button
          className="manifold-mobile-drawer-backdrop"
          aria-label="Close scene controls"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div
        className={`manifold-panel manifold-fade-in manifold-delay-2 manifold-scene-controls ${
          drawerOpen ? "is-open" : ""
        }`}
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
        {(onMission || missionContent) && (
          <button
            className="manifold-icon-btn"
            onClick={() => {
              onMission?.();
              setOpenTool((prev) => (prev === "mission" ? null : "mission"));
            }}
          >
            <Rocket size={12} /> <span>Mission Builder</span>
          </button>
        )}
        {openTool === "mission" && missionContent && (
          <div
            style={{
              maxHeight: 420,
              overflowY: "auto",
              border: "1px solid rgba(255,180,0,0.18)",
              padding: 8,
              background: "rgba(8,8,10,0.55)",
            }}
          >
            {missionContent}
          </div>
        )}
        {customTrajectoryContent && (
          <button
            className="manifold-icon-btn"
            onClick={() => setOpenTool((prev) => (prev === "trajectory" ? null : "trajectory"))}
          >
            <Orbit size={12} /> <span>Custom Trajectory</span>
          </button>
        )}
        {openTool === "trajectory" && customTrajectoryContent && (
          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              border: "1px solid rgba(0,255,255,0.16)",
              padding: 8,
              background: "rgba(0,8,14,0.55)",
            }}
          >
            {customTrajectoryContent}
          </div>
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
    </>
  );
}
