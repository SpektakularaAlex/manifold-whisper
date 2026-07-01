export const MANIFOLD_COLORS = {
  // Scientific visual convention used throughout Manifold:
  // stable manifolds approach the periodic orbit and are integrated backward
  // for visualization; unstable manifolds depart and are integrated forward.
  stable: "#0066FF",
  unstable: "#FF2200",
  stableMuted: "#4EA3FF",
  unstableMuted: "#FF5A3D",
} as const;

export const MISSION_TRANSFER_DISCLAIMER =
  "Educational approximate transfer: manifold endpoints are matched by closest approach, not optimized for a flight-ready trajectory.";
