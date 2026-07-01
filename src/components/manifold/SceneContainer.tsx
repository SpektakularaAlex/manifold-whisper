import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  useScene,
  type SceneAPI,
  type TrajectoryMeta,
  type PlottedSceneItem,
  type FamilyOrbitInput,
} from "@/hooks/useScene";

export { type SceneAPI };
export type { TrajectoryMeta, PlottedSceneItem, FamilyOrbitInput };

interface SceneContainerProps {
  onTrajectoryClick?: (meta: TrajectoryMeta) => void;
  onSceneItemsChange?: (items: PlottedSceneItem[]) => void;
  onHoverTargetChange?: (target: string | null) => void;
  onPreviewAnchorClick?: (target: string) => void;
  onPreviewFamilyClick?: (familyKey: string, orbitIndex: number) => void;
  onEmptySceneClick?: () => void;
}

export const SceneContainer = forwardRef<SceneAPI, SceneContainerProps>(function SceneContainer(
  {
    onTrajectoryClick,
    onSceneItemsChange,
    onHoverTargetChange,
    onPreviewAnchorClick,
    onPreviewFamilyClick,
    onEmptySceneClick,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneAPI = useScene(containerRef, {
    onTrajectoryClick,
    onSceneItemsChange,
    onHoverTargetChange,
    onPreviewAnchorClick,
    onPreviewFamilyClick,
    onEmptySceneClick,
  });
  useImperativeHandle(ref, () => sceneAPI, [sceneAPI]);
  return <div ref={containerRef} id="scene-container" aria-hidden="true" />;
});
