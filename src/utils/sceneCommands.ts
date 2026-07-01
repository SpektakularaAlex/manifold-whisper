import type { SceneAPI } from "@/hooks/useScene";
import type { AgentCommand } from "@/hooks/useAgent";
import { MANIFOLD_COLORS } from "@/components/manifold/constants";

// ── Per-system view transform ──────────────────────────────────────────────────
let _currentOriginShift: [number, number, number] = [0, 0, 0];
let _currentDisplayScale = 1.0;

export function setSceneTransform(
  originShift: [number, number, number],
  displayScale: number,
): void {
  _currentOriginShift = originShift;
  _currentDisplayScale = displayScale;
}

function transformPoint(p: [number, number, number]): [number, number, number] {
  return [
    (p[0] - _currentOriginShift[0]) * _currentDisplayScale,
    (p[1] - _currentOriginShift[1]) * _currentDisplayScale,
    (p[2] - _currentOriginShift[2]) * _currentDisplayScale,
  ];
}

export function renderOrbit(
  points: [number, number, number][],
  label: string,
  color: string,
  metadata: Parameters<SceneAPI["addTrajectory"]>[3],
  scene: SceneAPI,
): void {
  const transformed = points.map(transformPoint);
  scene.addTrajectory(transformed, color, label, metadata);
}

export function renderManifoldTubes(
  tubes: [number, number, number][][],
  color: string,
  scene: SceneAPI,
  metadata?: Parameters<SceneAPI["addManifoldTubes"]>[2],
): void {
  const transformed = tubes.map((tube) => tube.map(transformPoint));
  scene.addManifoldTubes(transformed, color, metadata);
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
      scene.addFamilyOrbits(data.orbits as FamilyOrbit[], fColor, fMin, fMax, fKey);
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
      const raw = data.trajectory as [number, number, number][];
      const color = (data.color as string | undefined) ?? "#00FFFF";
      const label = _orbitLabel(params);
      const family = params?.family as string | undefined;
      const libr = params?.libr as number | null | undefined;
      const branch = params?.branch as string | null | undefined;
      const index = params?.index as number | undefined;
      const familyKey = _buildFamilyKey(family, libr, branch);
      const metadata = {
        family,
        familyKey,
        libr,
        branch,
        orbitIndex: index,
        period: data.period as number | undefined,
        jacobi: data.jacobi as number | undefined,
        serializable: { kind: "orbit", familyKey, orbitIndex: index ?? 0 },
      };
      renderOrbit(raw, label, color, metadata, scene);
      break;
    }

    case "show_manifold": {
      type TubeArray = [number, number, number][][];
      const source = _manifoldSource(data, params);
      const manifoldSettings = _manifoldSettings(data, params);
      if (data?.unstable_plus) {
        renderManifoldTubes(data.unstable_plus as TubeArray, MANIFOLD_COLORS.unstable, scene, {
          label: "Unstable manifold (+)",
          kind: "unstable",
          sourceKey: source.familyKey,
          serializable: { ...source, kind: "manifold", manifoldType: "unstable", manifoldSettings },
        });
      }
      if (data?.unstable_minus) {
        renderManifoldTubes(
          data.unstable_minus as TubeArray,
          MANIFOLD_COLORS.unstableMuted,
          scene,
          {
            label: "Unstable manifold (-)",
            kind: "unstable",
            sourceKey: source.familyKey,
            serializable: {
              ...source,
              kind: "manifold",
              manifoldType: "unstable",
              manifoldSettings,
            },
          },
        );
      }
      if (data?.stable_plus) {
        renderManifoldTubes(data.stable_plus as TubeArray, MANIFOLD_COLORS.stable, scene, {
          label: "Stable manifold (+)",
          kind: "stable",
          sourceKey: source.familyKey,
          serializable: { ...source, kind: "manifold", manifoldType: "stable", manifoldSettings },
        });
      }
      if (data?.stable_minus) {
        renderManifoldTubes(data.stable_minus as TubeArray, MANIFOLD_COLORS.stableMuted, scene, {
          label: "Stable manifold (-)",
          kind: "stable",
          sourceKey: source.familyKey,
          serializable: { ...source, kind: "manifold", manifoldType: "stable", manifoldSettings },
        });
      }
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
        scene.addTrajectory(leg.trajectory, leg.color, leg.label, {
          family: leg.type,
          itemType: leg.type.includes("manifold")
            ? leg.type.includes("arrival")
              ? "stable-manifold"
              : "unstable-manifold"
            : "mission",
          sourceKey: "agent-mission",
        });
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

function _manifoldSettings(
  data: Record<string, unknown> | undefined,
  params: Record<string, unknown> | undefined,
): { nBranches: number; propagationTime: number } {
  const source = data?._sceneSource as
    | { manifoldSettings?: { nBranches?: number; propagationTime?: number } }
    | undefined;
  return {
    nBranches:
      source?.manifoldSettings?.nBranches ??
      (typeof params?.n_branches === "number" ? params.n_branches : 80),
    propagationTime:
      source?.manifoldSettings?.propagationTime ??
      (typeof params?.propagation_time === "number"
        ? params.propagation_time
        : typeof params?.t_forward === "number"
          ? params.t_forward
          : 3.0),
  };
}

function _orbitLabel(params: Record<string, unknown> | undefined): string {
  if (!params) return "Orbit";
  const family = String(params.family ?? "orbit");
  const libr = params.libr != null ? ` L${params.libr}` : "";
  return `${family}${libr}`;
}

function _buildFamilyKey(
  family: string | undefined,
  libr: number | null | undefined,
  branch: string | null | undefined,
): string | undefined {
  if (!family) return undefined;
  const parts = [family];
  if (libr != null) parts.push(`L${libr}`);
  if (branch) parts.push(branch);
  return parts.join("_");
}

function _manifoldSource(
  data: Record<string, unknown> | undefined,
  params: Record<string, unknown> | undefined,
): {
  sourceFamilyKey?: string;
  familyKey?: string;
  orbitIndex?: number;
} {
  const source = data?._sceneSource as
    | { familyKey?: string; orbitIndex?: number; sourceFamilyKey?: string }
    | undefined;
  if (source) {
    return {
      sourceFamilyKey: source.sourceFamilyKey ?? source.familyKey,
      familyKey: source.familyKey ?? source.sourceFamilyKey,
      orbitIndex: source.orbitIndex,
    };
  }
  const family = params?.family as string | undefined;
  const libr = params?.libr as number | null | undefined;
  const branch = params?.branch as string | null | undefined;
  const orbitIndex = params?.index as number | undefined;
  const familyKey = _buildFamilyKey(family, libr, branch);
  return { sourceFamilyKey: familyKey, familyKey, orbitIndex };
}
