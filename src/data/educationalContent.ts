import type { TrajectoryMeta } from "@/hooks/useScene";

export type SceneSelection =
  | { type: "default" }
  | { type: "body"; key: "earth" | "moon" }
  | { type: "lagrange"; key: "l1" | "l2" | "l3" | "l4" | "l5" }
  | { type: "family"; familyKey: string; familyName?: string }
  | {
      type: "orbit";
      orbitId?: string;
      familyKey?: string;
      familyName?: string;
      jacobi?: number;
      period?: number;
      periodDays?: number;
      stability?: number;
    }
  | {
      type: "manifold";
      manifoldType: "stable" | "unstable";
      sourceFamilyKey?: string;
      orbitIndex?: number;
    }
  | { type: "customTrajectory"; id: string; label?: string; jacobi?: number };

export type EducationalContentKey =
  | "default"
  | "earth"
  | "moon"
  | "l1"
  | "l2"
  | "l3"
  | "l4"
  | "l5"
  | "halo"
  | "lyapunov"
  | "dro"
  | "axial"
  | "vertical"
  | "butterfly"
  | "dragonfly"
  | "long_period"
  | "short_period"
  | "stable_manifold"
  | "unstable_manifold"
  | "jacobi_constant"
  | "period"
  | "cr3bp"
  | "lagrange_points"
  | "unstable_orbit_requirement"
  | "transfer_planning"
  | "educational_transfer"
  | "custom_trajectory";

export type EducationalContentEntry = {
  title: string;
  subtitle?: string;
  beginner: string;
  technical?: string;
  bullets?: string[];
  relatedTerms?: EducationalContentKey[];
};

export const EDUCATIONAL_CONTENT: Record<EducationalContentKey, EducationalContentEntry> = {
  default: {
    title: "Earth-Moon CR3BP Atlas",
    subtitle: "Rotating-frame gravitational highways",
    beginner:
      "Manifold lets you explore periodic orbits and natural transport tubes in the Earth-Moon three-body problem. Click Earth, Moon, a Lagrange point, an orbit, or a manifold to inspect what it means.",
    technical:
      "The scene uses normalized Earth-Moon CR3BP units in the rotating frame. Geometry is educational and scientifically grounded, but transfer paths here are not flight-ready optimized trajectories.",
    relatedTerms: ["cr3bp", "lagrange_points", "jacobi_constant"],
  },
  earth: {
    title: "Earth",
    subtitle: "Primary body",
    beginner:
      "Earth is the massive primary in the Earth-Moon CR3BP. In the rotating frame it remains fixed while spacecraft trajectories curve under Earth, Moon, and rotating-frame effects.",
    technical:
      "In normalized CR3BP coordinates Earth sits near x = -mu, where mu is the Earth-Moon mass ratio.",
    relatedTerms: ["cr3bp", "lagrange_points"],
  },
  moon: {
    title: "Moon",
    subtitle: "Secondary body",
    beginner:
      "The Moon is the smaller secondary body. Many useful cislunar staging orbits live near the Moon-side L1 and L2 regions.",
    technical:
      "The Moon sits near x = 1 - mu. Distant retrograde and low prograde families are Moon-associated periodic orbits.",
    relatedTerms: ["dro", "l1", "l2"],
  },
  l1: {
    title: "L1",
    subtitle: "Gateway between Earth and Moon",
    beginner:
      "L1 is the balance region between Earth and Moon. Orbits around L1 can act as waystations for transfers between low Earth space and lunar space.",
    relatedTerms: ["halo", "lyapunov", "stable_manifold", "unstable_manifold"],
  },
  l2: {
    title: "L2",
    subtitle: "Far-side lunar gateway",
    beginner:
      "L2 lies beyond the Moon. Halo and near-rectilinear halo-like paths around this region are important for lunar gateway concepts.",
    relatedTerms: ["halo", "lyapunov", "transfer_planning"],
  },
  l3: {
    title: "L3",
    subtitle: "Far side of Earth from the Moon",
    beginner:
      "L3 sits opposite the Moon across Earth. It is less common for operational lunar missions but helps complete the CR3BP family atlas.",
    relatedTerms: ["lyapunov", "halo"],
  },
  l4: {
    title: "L4",
    subtitle: "Triangular equilibrium",
    beginner:
      "L4 forms an equilateral triangle with Earth and Moon. Around triangular points, long-period, short-period, axial, and vertical families can appear.",
    relatedTerms: ["long_period", "short_period", "vertical"],
  },
  l5: {
    title: "L5",
    subtitle: "Triangular equilibrium",
    beginner:
      "L5 mirrors L4 on the other side of the Moon's orbit. These triangular regions are dynamically different from the collinear L1, L2, and L3 regions.",
    relatedTerms: ["long_period", "short_period", "axial"],
  },
  halo: {
    title: "Halo Orbits",
    beginner:
      "Halo orbits are three-dimensional periodic orbits around collinear Lagrange points. They arc above or below the Earth-Moon plane.",
    technical: "Northern and southern branches differ by the sign of their out-of-plane motion.",
    relatedTerms: ["l1", "l2", "unstable_orbit_requirement"],
  },
  lyapunov: {
    title: "Lyapunov Orbits",
    beginner:
      "Lyapunov orbits are planar periodic orbits around collinear Lagrange points. They are often the simplest family to inspect near L1, L2, or L3.",
    relatedTerms: ["jacobi_constant", "period"],
  },
  dro: {
    title: "Distant Retrograde Orbits",
    beginner:
      "DROs loop around the Moon in the rotating frame and can be relatively stable, which makes them attractive for cislunar mission concepts.",
    relatedTerms: ["moon", "jacobi_constant"],
  },
  axial: {
    title: "Axial Orbits",
    beginner:
      "Axial families are three-dimensional periodic orbits that extend out of the rotating-frame plane.",
    relatedTerms: ["vertical", "period"],
  },
  vertical: {
    title: "Vertical Orbits",
    beginner:
      "Vertical families move above and below the Earth-Moon plane and reveal the spatial structure of CR3BP dynamics.",
    relatedTerms: ["axial", "halo"],
  },
  butterfly: {
    title: "Butterfly Orbits",
    beginner:
      "Butterfly families have wide, wing-like three-dimensional shapes. They are visually rich examples of periodic CR3BP motion.",
    relatedTerms: ["dragonfly", "jacobi_constant"],
  },
  dragonfly: {
    title: "Dragonfly Orbits",
    beginner:
      "Dragonfly families are complex spatial periodic orbits that show how varied three-body periodic motion can become.",
    relatedTerms: ["butterfly", "period"],
  },
  long_period: {
    title: "Long-Period Orbits",
    beginner:
      "Long-period families around L4 and L5 take more rotating-frame time to close and trace broad triangular-region dynamics.",
    relatedTerms: ["l4", "l5"],
  },
  short_period: {
    title: "Short-Period Orbits",
    beginner:
      "Short-period families around L4 and L5 close more quickly and remain comparatively compact around the triangular points.",
    relatedTerms: ["l4", "l5"],
  },
  stable_manifold: {
    title: "Stable Manifold",
    subtitle: "Blue arrival highway",
    beginner:
      "A stable manifold is a tube of trajectories that naturally coast toward a periodic orbit. In transfer planning, it is used as the arrival highway to the target orbit.",
    technical:
      "Stable branches come from stable eigendirections of an unstable periodic orbit's monodromy matrix.",
    relatedTerms: ["unstable_manifold", "transfer_planning", "unstable_orbit_requirement"],
  },
  unstable_manifold: {
    title: "Unstable Manifold",
    subtitle: "Red departure highway",
    beginner:
      "An unstable manifold is a tube of trajectories that naturally drift away from a periodic orbit. In transfer planning, it is used as the departure highway from the starting orbit.",
    relatedTerms: ["stable_manifold", "transfer_planning"],
  },
  jacobi_constant: {
    title: "Jacobi Constant",
    beginner:
      "The Jacobi constant is an energy-like conserved value in the rotating CR3BP. It helps organize which regions of space a trajectory can access.",
    technical:
      "C = 2 Omega - v^2 in normalized rotating-frame units. Larger or smaller values change the zero-velocity surfaces.",
    relatedTerms: ["cr3bp"],
  },
  period: {
    title: "Period",
    beginner:
      "A periodic orbit returns to its starting state after one period. Manifold often plots two periods so the orbit is visually complete.",
    relatedTerms: ["jacobi_constant"],
  },
  cr3bp: {
    title: "CR3BP Rotating Frame",
    beginner:
      "The circular restricted three-body problem models a tiny spacecraft moving under two larger bodies on circular orbits. In the rotating frame, Earth and Moon stay fixed.",
    technical:
      "The model is nondimensional and includes Coriolis and centrifugal terms from the rotating coordinate frame.",
    relatedTerms: ["earth", "moon", "jacobi_constant"],
  },
  lagrange_points: {
    title: "Lagrange Points",
    beginner:
      "Lagrange points are equilibrium locations in the rotating frame where gravity and rotating-frame effects balance.",
    relatedTerms: ["l1", "l2", "l3", "l4", "l5"],
  },
  unstable_orbit_requirement: {
    title: "Why Some Orbits Have No Manifolds",
    beginner:
      "Invariant manifolds are generated from unstable periodic orbits. If a periodic orbit is linearly stable, the monodromy matrix does not provide the unstable or stable eigendirections needed to generate these manifold tubes.",
    technical:
      "For stable or near-stable orbits, Manifold can still plot the orbit itself, but it cannot plot stable/unstable manifold branches in the same sense.",
    relatedTerms: ["stable_manifold", "unstable_manifold"],
  },
  transfer_planning: {
    title: "Manifold Transfer Planning",
    beginner:
      "A low-energy transfer typically departs along an unstable manifold from the starting orbit and arrives along a stable manifold into the target orbit.",
    technical:
      "The current transfer planner matches manifold geometry for education; it is not an optimized trajectory design tool.",
    relatedTerms: ["unstable_manifold", "stable_manifold", "educational_transfer"],
  },
  educational_transfer: {
    title: "Educational vs Flight-Ready Transfer",
    beginner:
      "An educational transfer shows the geometry of possible low-energy pathways. A flight-ready trajectory still needs optimization, constraints, maneuvers, navigation margins, and mission design review.",
    relatedTerms: ["transfer_planning"],
  },
  custom_trajectory: {
    title: "Custom Trajectory",
    beginner:
      "A custom trajectory starts from user-entered normalized rotating-frame initial conditions and is propagated through the Earth-Moon CR3BP equations.",
    relatedTerms: ["cr3bp", "jacobi_constant"],
  },
};

export function contentKeyForFamily(familyKey: string | undefined): EducationalContentKey {
  const key = (familyKey ?? "").toLowerCase();
  if (key.includes("lyapunov")) return "lyapunov";
  if (key.includes("halo")) return "halo";
  if (key.includes("distant_retrograde") || key === "dro") return "dro";
  if (key.includes("axial")) return "axial";
  if (key.includes("vertical")) return "vertical";
  if (key.includes("butterfly")) return "butterfly";
  if (key.includes("dragonfly")) return "dragonfly";
  if (key.includes("long_period")) return "long_period";
  if (key.includes("short_period")) return "short_period";
  return "default";
}

export function contentForSelection(selection: SceneSelection): EducationalContentEntry {
  if (selection.type === "body") return EDUCATIONAL_CONTENT[selection.key];
  if (selection.type === "lagrange") return EDUCATIONAL_CONTENT[selection.key];
  if (selection.type === "family")
    return EDUCATIONAL_CONTENT[contentKeyForFamily(selection.familyKey)];
  if (selection.type === "orbit")
    return EDUCATIONAL_CONTENT[contentKeyForFamily(selection.familyKey)];
  if (selection.type === "manifold") {
    return EDUCATIONAL_CONTENT[
      selection.manifoldType === "stable" ? "stable_manifold" : "unstable_manifold"
    ];
  }
  if (selection.type === "customTrajectory") return EDUCATIONAL_CONTENT.custom_trajectory;
  return EDUCATIONAL_CONTENT.default;
}

export function selectionFromTrajectory(meta: TrajectoryMeta): SceneSelection {
  const serializable = meta.serializable ?? {};
  if (serializable.kind === "customTrajectory") {
    return { type: "customTrajectory", id: meta.id, label: meta.label, jacobi: meta.jacobi };
  }
  if (meta.itemType === "stable-manifold" || meta.itemType === "unstable-manifold") {
    return {
      type: "manifold",
      manifoldType: meta.itemType === "stable-manifold" ? "stable" : "unstable",
      sourceFamilyKey:
        typeof serializable.sourceFamilyKey === "string"
          ? serializable.sourceFamilyKey
          : meta.familyKey,
      orbitIndex: meta.orbitIndex,
    };
  }
  return {
    type: "orbit",
    orbitId: meta.id,
    familyKey: meta.familyKey,
    familyName: meta.label,
    jacobi: meta.jacobi,
    period: meta.period,
    periodDays: meta.periodDays,
    stability: meta.stability,
  };
}
