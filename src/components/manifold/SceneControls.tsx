import { Save, Trash2, Info, Rocket } from "lucide-react";

interface SceneControlsProps {
  onSaveScene: () => void;
  onClearTrajectories: () => void;
  onToggleLabels: () => void;
  onMission?: () => void;
}

export function SceneControls({
  onSaveScene,
  onClearTrajectories,
  onToggleLabels,
  onMission,
}: SceneControlsProps) {
  return (
    <div
      className="manifold-panel manifold-fade-in manifold-delay-2"
      style={{
        position: "absolute",
        top: 24,
        right: 24,
        width: 180,
        padding: "14px 14px",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
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
      <button className="manifold-icon-btn" onClick={onClearTrajectories}>
        <Trash2 size={12} /> <span>Clear Trajectories</span>
      </button>
      <button className="manifold-icon-btn" onClick={onToggleLabels}>
        <Info size={12} /> <span>Lagrange Points</span>
      </button>
      {onMission && (
        <button className="manifold-icon-btn" onClick={onMission}>
          <Rocket size={12} /> <span>Mission Builder</span>
        </button>
      )}
    </div>
  );
}
