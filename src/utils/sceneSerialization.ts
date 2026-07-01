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

export type SavedTransferDescriptor = {
  departureFamilyKey: string;
  departureOrbitIndex: number;
  departureLabel?: string;
  arrivalFamilyKey: string;
  arrivalOrbitIndex: number;
  arrivalLabel?: string;
  system?: string;
  nBranches?: number;
  propagationTime?: number;
  closestStrategy?: string;
};

export type SavedMissionDescriptor = {
  legs: Array<Record<string, unknown>>;
  system?: string;
};

export type SavedManifoldSettings = {
  nBranches?: number;
  propagationTime?: number;
};

export type SavedSceneStateV2 = Omit<SavedSceneStateV1, "version" | "plottedItems"> & {
  version: 2;
  plottedItems: Array<
    SavedSceneStateV1["plottedItems"][number] & {
      system?: string;
      jacobi?: number;
      period?: number;
      transfer?: SavedTransferDescriptor;
      mission?: SavedMissionDescriptor;
      manifoldSettings?: SavedManifoldSettings;
    }
  >;
};

export type SavedSceneState = SavedSceneStateV1 | SavedSceneStateV2;

type CameraState = SavedSceneState["camera"];

function toSavedType(item: PlottedSceneItem): SavedSceneItemType {
  if (item.sourceKey === "mission-transfer" || item.serializable?.kind === "transferSegment") {
    return "transfer";
  }
  if (item.sourceKey === "mission-builder" || item.serializable?.kind === "missionBuilderSegment") {
    return "mission";
  }
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
}): SavedSceneStateV2 {
  return {
    version: 2,
    system: args.system,
    plottedItems: args.plottedItems.map((item) => {
      const serializable = item.serializable ?? {};
      const transfer = readTransferDescriptor(serializable, args.system);
      const mission = readMissionDescriptor(serializable, args.system);
      const manifoldSettings = readManifoldSettings(serializable);
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
        system: args.system,
        familyKey,
        orbitIndex,
        jacobi: typeof serializable.jacobi === "number" ? serializable.jacobi : undefined,
        period: typeof serializable.period === "number" ? serializable.period : undefined,
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
        transfer,
        mission,
        manifoldSettings,
      };
    }),
    selectedAnchor: args.selectedAnchor ?? null,
    camera: args.camera,
  };
}

function readManifoldSettings(
  serializable: Record<string, unknown>,
): SavedManifoldSettings | undefined {
  const raw = serializable.manifoldSettings;
  if (!raw || typeof raw !== "object") return undefined;
  const settings = raw as Record<string, unknown>;
  return {
    nBranches: typeof settings.nBranches === "number" ? settings.nBranches : undefined,
    propagationTime:
      typeof settings.propagationTime === "number" ? settings.propagationTime : undefined,
  };
}

function readMissionDescriptor(
  serializable: Record<string, unknown>,
  fallbackSystem: string,
): SavedMissionDescriptor | undefined {
  const raw = serializable.mission;
  if (!raw || typeof raw !== "object") return undefined;
  const mission = raw as Record<string, unknown>;
  if (!Array.isArray(mission.legs)) return undefined;
  return {
    legs: mission.legs.filter(
      (leg): leg is Record<string, unknown> => Boolean(leg) && typeof leg === "object",
    ),
    system: typeof mission.system === "string" ? mission.system : fallbackSystem,
  };
}

function readTransferDescriptor(
  serializable: Record<string, unknown>,
  fallbackSystem: string,
): SavedTransferDescriptor | undefined {
  const raw = serializable.transfer;
  if (!raw || typeof raw !== "object") return undefined;
  const transfer = raw as Record<string, unknown>;
  if (
    typeof transfer.departureFamilyKey !== "string" ||
    typeof transfer.arrivalFamilyKey !== "string"
  ) {
    return undefined;
  }
  return {
    departureFamilyKey: transfer.departureFamilyKey,
    departureOrbitIndex:
      typeof transfer.departureOrbitIndex === "number" ? transfer.departureOrbitIndex : 0,
    departureLabel:
      typeof transfer.departureLabel === "string" ? transfer.departureLabel : undefined,
    arrivalFamilyKey: transfer.arrivalFamilyKey,
    arrivalOrbitIndex:
      typeof transfer.arrivalOrbitIndex === "number" ? transfer.arrivalOrbitIndex : 0,
    arrivalLabel: typeof transfer.arrivalLabel === "string" ? transfer.arrivalLabel : undefined,
    system: typeof transfer.system === "string" ? transfer.system : fallbackSystem,
    nBranches: typeof transfer.nBranches === "number" ? transfer.nBranches : undefined,
    propagationTime:
      typeof transfer.propagationTime === "number" ? transfer.propagationTime : undefined,
    closestStrategy:
      typeof transfer.closestStrategy === "string" ? transfer.closestStrategy : undefined,
  };
}

export function serializeSceneState(state: SavedSceneState): string {
  const json = JSON.stringify(state);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function deserializeSceneState(key: string): SavedSceneState {
  const padded = key
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(key.length / 4) * 4, "=");
  const parsed = JSON.parse(atob(padded)) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    ![1, 2].includes(Number((parsed as { version?: unknown }).version))
  ) {
    throw new Error("Unsupported scene key version.");
  }
  return parsed as SavedSceneState;
}
