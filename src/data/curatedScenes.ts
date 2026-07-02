import type { SavedSceneStateV2 } from "@/utils/sceneSerialization";

export type CuratedScene = {
  id: string;
  title: string;
  description: string;
  sceneState: SavedSceneStateV2;
};

function familyItem(familyKey: string, color: string, label: string) {
  return {
    id: familyKey,
    type: "family" as const,
    system: "earth-moon",
    familyKey,
    sourceFamilyKey: familyKey,
    label,
    visible: true,
    color,
    sourceKey: familyKey,
  };
}

function manifoldItem(
  familyKey: string,
  orbitIndex: number,
  manifoldType: "stable" | "unstable" | "both",
  label: string,
) {
  return {
    id: `${familyKey}:${orbitIndex}:${manifoldType}`,
    type: "manifold" as const,
    system: "earth-moon",
    familyKey,
    sourceFamilyKey: familyKey,
    orbitIndex,
    manifoldType,
    label,
    visible: true,
    color: manifoldType === "stable" ? "#0066FF" : "#FF2200",
    sourceKey: familyKey,
    manifoldSettings: { nBranches: 32, propagationTime: 3.0 },
  };
}

export const CURATED_SCENES: CuratedScene[] = [
  {
    id: "l1-halo-manifold",
    title: "L1 Halo Manifold",
    description: "A northern L1 halo family with stable and unstable tubes.",
    sceneState: {
      version: 2,
      system: "earth-moon",
      plottedItems: [
        familyItem("halo_L1_N", "#FFFFFF", "L1 North Halo"),
        manifoldItem("halo_L1_N", 120, "both", "L1 halo manifold atlas"),
      ],
      selectedAnchor: "L1",
      camera: { position: [0.25, -1.9, 0.9], target: [0.82, 0, 0] },
    },
  },
  {
    id: "l2-axial-transfer-style",
    title: "L2 Axial Transfer Geometry",
    description: "L2 axial and halo structures with manifold branches near the Moon.",
    sceneState: {
      version: 2,
      system: "earth-moon",
      plottedItems: [
        familyItem("axial_L2", "#BB77EE", "L2 Axial"),
        familyItem("halo_L2_N", "#AADDFF", "L2 North Halo"),
        manifoldItem("halo_L2_N", 120, "both", "L2 halo manifold branches"),
      ],
      selectedAnchor: "L2",
      camera: { position: [0.8, -1.6, 0.75], target: [1.03, 0, 0] },
    },
  },
  {
    id: "dro-and-manifold-atlas",
    title: "DRO And Lunar Atlas",
    description: "A distant retrograde family with nearby L1 manifold geometry.",
    sceneState: {
      version: 2,
      system: "earth-moon",
      plottedItems: [
        familyItem("distant_retrograde", "#FF44AA", "Distant Retrograde"),
        familyItem("distant_prograde", "#00FFEE", "Distant Prograde"),
        manifoldItem("lyapunov_L1", 120, "both", "L1 Lyapunov manifolds"),
      ],
      selectedAnchor: "Moon",
      camera: { position: [0.55, -2.1, 1.05], target: [0.85, 0, 0] },
    },
  },
  {
    id: "l1-l2-comparison",
    title: "L1 L2 Comparison",
    description: "Side-by-side L1 and L2 Lyapunov families with manifold tubes.",
    sceneState: {
      version: 2,
      system: "earth-moon",
      plottedItems: [
        familyItem("lyapunov_L1", "#00FFFF", "L1 Lyapunov"),
        familyItem("lyapunov_L2", "#00DDDD", "L2 Lyapunov"),
        manifoldItem("lyapunov_L1", 120, "unstable", "L1 unstable manifold"),
        manifoldItem("lyapunov_L2", 120, "stable", "L2 stable manifold"),
      ],
      selectedAnchor: "L1",
      camera: { position: [0.2, -2.35, 1.0], target: [0.92, 0, 0] },
    },
  },
];

export function randomCuratedScene(): CuratedScene {
  return CURATED_SCENES[Math.floor(Math.random() * CURATED_SCENES.length)];
}
