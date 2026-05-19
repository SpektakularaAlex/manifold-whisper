import type { SceneAPI } from "@/hooks/useScene";
import type { AgentCommand } from "@/hooks/useAgent";

// ── Per-system view transform ──────────────────────────────────────────────────
let _currentOriginShift: [number, number, number] = [0, 0, 0]
let _currentDisplayScale = 1.0

export function setSceneTransform(
  originShift: [number, number, number],
  displayScale: number,
): void {
  _currentOriginShift = originShift
  _currentDisplayScale = displayScale
}

function transformPoint(p: [number, number, number]): [number, number, number] {
  return [
    (p[0] - _currentOriginShift[0]) * _currentDisplayScale,
    (p[1] - _currentOriginShift[1]) * _currentDisplayScale,
    (p[2] - _currentOriginShift[2]) * _currentDisplayScale,
  ]
}

export function renderOrbit(
  points: [number, number, number][],
  label: string,
  color: string,
  metadata: { period?: number; jacobi?: number; family?: string },
  scene: SceneAPI,
): void {
  const transformed = points.map(transformPoint)
  scene.addTrajectory(transformed, color, label, metadata)
}

export function renderManifoldTubes(
  tubes: [number, number, number][][],
  color: string,
  scene: SceneAPI,
): void {
  const transformed = tubes.map(tube => tube.map(transformPoint))
  scene.addManifoldTubes(transformed, color)
}

export interface FamilyShownMeta {
  familyKey: string;
  label: string;
  color: string;
  jacobi_min: number;
  jacobi_max: number;
  count: number;
}

export function executeCommand(
  cmd: AgentCommand,
  scene: SceneAPI,
  onFamilyShown?: (meta: FamilyShownMeta) => void,
): void {
  const { action, data, params } = cmd;

  if (cmd.error) {
    console.error("Agent command error:", cmd.error);
    return;
  }

  switch (action) {
    case "show_family": {
      if (!data?.orbits || !data.family_key) break;
      type FamilyOrbit = {
        trajectory: [number, number, number][];
        jacobi: number;
        period_tu: number;
        period_days: number;
        stability: number;
        index: number;
      };
      const fKey = data.family_key as string;
      const fColor = (data.color as string) ?? "#AADDFF";
      const fMin = (data.jacobi_min as number) ?? 0;
      const fMax = (data.jacobi_max as number) ?? 1;
      scene.addFamilyOrbits(
        data.orbits as FamilyOrbit[],
        fColor,
        fMin,
        fMax,
        fKey,
      );
      onFamilyShown?.({
        familyKey: fKey,
        label: (data.label as string) ?? fKey,
        color: fColor,
        jacobi_min: fMin,
        jacobi_max: fMax,
        count: (data.orbits as unknown[]).length,
      });
      break;
    }

    case "show_orbit": {
      if (!data?.trajectory) break;
      const raw   = data.trajectory as [number, number, number][];
      const color = (data.color as string | undefined) ?? "#00FFFF";
      const label = _orbitLabel(params);
      const metadata = {
        family: params?.family as string | undefined,
        period: data.period as number | undefined,
        jacobi: data.jacobi as number | undefined,
      };
      renderOrbit(raw, label, color, metadata, scene);
      break;
    }

    case "show_manifold": {
      type TubeArray = [number, number, number][][];
      if (data?.unstable_plus)  renderManifoldTubes(data.unstable_plus  as TubeArray, "#FF2200", scene);
      if (data?.unstable_minus) renderManifoldTubes(data.unstable_minus as TubeArray, "#FF7700", scene);
      if (data?.stable_plus)    renderManifoldTubes(data.stable_plus    as TubeArray, "#0066FF", scene);
      if (data?.stable_minus)   renderManifoldTubes(data.stable_minus   as TubeArray, "#00BBFF", scene);
      break;
    }

    case "clear":
      scene.clearTrajectories();
      break;

    case "show_lagrange":
      scene.showLagrangePoints(true);
      break;

    case "camera_move":
      scene.resetCamera();
      break;

    case "design_mission": {
      if (!data?.legs) break;
      scene.clearTrajectories();
      for (const leg of data.legs as Array<{
        trajectory: [number, number, number][];
        color: string;
        label: string;
        type: string;
      }>) {
        if (!leg.trajectory || leg.trajectory.length === 0) continue;
        scene.addTrajectory(leg.trajectory, leg.color, leg.label, { family: leg.type });
      }
      if (data.total_trajectory && (data.total_trajectory as unknown[]).length > 0) {
        scene.animateSpacecraft(
          data.total_trajectory as [number, number, number][],
          data.total_duration as number,
        );
      }
      break;
    }

    default:
      console.warn("Unknown agent action:", action);
  }
}

function _orbitLabel(params: Record<string, unknown> | undefined): string {
  if (!params) return "Orbit";
  const family = String(params.family ?? "orbit");
  const libr = params.libr != null ? ` L${params.libr}` : "";
  return `${family}${libr}`;
}
