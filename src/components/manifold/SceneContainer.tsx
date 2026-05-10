import { forwardRef, useImperativeHandle, useRef } from "react";
import { useScene, type SceneAPI, type TrajectoryMeta } from "@/hooks/useScene";

export { type SceneAPI };
export type { TrajectoryMeta };

interface SceneContainerProps {
  onTrajectoryClick?: (meta: TrajectoryMeta) => void;
}

export const SceneContainer = forwardRef<SceneAPI, SceneContainerProps>(
  function SceneContainer({ onTrajectoryClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneAPI = useScene(containerRef, { onTrajectoryClick });
    useImperativeHandle(ref, () => sceneAPI, [sceneAPI]);
    return <div ref={containerRef} id="scene-container" aria-hidden="true" />;
  },
);
