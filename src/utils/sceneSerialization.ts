import type { PlottedSceneItem } from "@/components/manifold/SceneContainer";

export type SavedSceneItemType =
  | "family"
  | "orbit"
  | "manifold"
  | "mission"
  | "transfer"
  | "customTrajectory"
  | "marker";

export type SavedSceneStateV1 = {
  version: 1;
  system: string;
  plottedItems: Array<{
    id?: string;
    type: SavedSceneItemType;
    familyKey?: string;
    orbitIndex?: number;
    manifoldType?: "stable" | "unstable" | "both";
    sourceFamilyKey?: string;
    label?: string;
    visible: boolean;
    color?: string;
    sourceKey?: string;
    customTrajectory?: {
      state0: [number, number, number, number, number, number];
      tSpan: number;
      nPoints: number;
      direction: "forward" | "backward";
      label?: string;
      jacobi?: number;
    };
  }>;
  selectedAnchor?: string | null;
  camera?: {
    position: [number, number, number];
    target?: [number, number, number];
    zoom?: number;
  };
};

type CameraState = SavedSceneStateV1["camera"];

function toSavedType(item: PlottedSceneItem): SavedSceneItemType {
  if (item.type === "stable-manifold" || item.type === "unstable-manifold") return "manifold";
  if (item.type === "family") return "family";
  if (item.type === "mission") {
    return item.sourceKey === "mission-transfer" ? "transfer" : "mission";
  }
  if (item.type === "custom-trajectory") return "customTrajectory";
  if (item.type === "marker") return "marker";
  return "orbit";
}

function manifoldType(item: PlottedSceneItem): "stable" | "unstable" | "both" | undefined {
  if (item.type === "stable-manifold") return "stable";
  if (item.type === "unstable-manifold") return "unstable";
  return undefined;
}

export function buildSavedSceneStateFromAppState(args: {
  system: string;
  plottedItems: PlottedSceneItem[];
  selectedAnchor?: string | null;
  camera?: CameraState;
}): SavedSceneStateV1 {
  return {
    version: 1,
    system: args.system,
    plottedItems: args.plottedItems.map((item) => {
      const serializable = item.serializable ?? {};
      const familyKey =
        typeof serializable.familyKey === "string"
          ? serializable.familyKey
          : item.sourceKey?.startsWith("agent-") || item.sourceKey?.startsWith("mission-")
            ? undefined
            : item.sourceKey;
      const sourceFamilyKey =
        typeof serializable.sourceFamilyKey === "string" ? serializable.sourceFamilyKey : familyKey;
      const orbitIndex =
        typeof serializable.orbitIndex === "number" ? serializable.orbitIndex : undefined;
      const customTrajectory =
        serializable.kind === "customTrajectory" &&
        Array.isArray(serializable.state0) &&
        serializable.state0.length === 6
          ? {
              state0: serializable.state0 as [number, number, number, number, number, number],
              tSpan: Number(serializable.tSpan ?? 5),
              nPoints: Number(serializable.nPoints ?? 1000),
              direction:
                serializable.direction === "backward"
                  ? ("backward" as const)
                  : ("forward" as const),
              label: typeof serializable.label === "string" ? serializable.label : item.name,
              jacobi: typeof serializable.jacobi === "number" ? serializable.jacobi : undefined,
            }
          : undefined;

      return {
        id: item.id,
        type: toSavedType(item),
        familyKey,
        orbitIndex,
        manifoldType:
          typeof serializable.manifoldType === "string"
            ? (serializable.manifoldType as "stable" | "unstable" | "both")
            : manifoldType(item),
        sourceFamilyKey,
        label: item.name,
        visible: item.visible,
        color: item.color,
        sourceKey: item.sourceKey,
        customTrajectory,
      };
    }),
    selectedAnchor: args.selectedAnchor ?? null,
    camera: args.camera,
  };
}

export function serializeSceneState(state: SavedSceneStateV1): string {
  const json = JSON.stringify(state);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function deserializeSceneState(key: string): SavedSceneStateV1 {
  const padded = key
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(key.length / 4) * 4, "=");
  const parsed = JSON.parse(atob(padded)) as unknown;
  if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) {
    throw new Error("Unsupported scene key version.");
  }
  return parsed as SavedSceneStateV1;
}
