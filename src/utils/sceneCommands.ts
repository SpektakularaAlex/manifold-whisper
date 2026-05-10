import type { SceneAPI } from "@/hooks/useScene";
import type { AgentCommand } from "@/hooks/useAgent";

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
      scene.addTrajectory(raw, color, label, metadata);
      break;
    }

    case "show_manifold": {
      type TubeArray = [number, number, number][][];
      // Backend now returns four named half-tube arrays; render each with a distinct color
      if (data?.unstable_plus)  scene.addManifoldTubes(data.unstable_plus  as TubeArray, "#FF2200");
      if (data?.unstable_minus) scene.addManifoldTubes(data.unstable_minus as TubeArray, "#FF7700");
      if (data?.stable_plus)    scene.addManifoldTubes(data.stable_plus    as TubeArray, "#0066FF");
      if (data?.stable_minus)   scene.addManifoldTubes(data.stable_minus   as TubeArray, "#00BBFF");
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
