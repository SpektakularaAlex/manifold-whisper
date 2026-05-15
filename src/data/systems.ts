export interface FamilyMeta {
  id: string
  label: string
  requiresLibr: boolean
  requiresBranch: boolean
  availableLibr: number[]
  availableBranches: string[]
  description: string
  color: string
}

export interface CRSystem {
  id: string
  label: string
  description: string
  funFact: string
  mu: number
  primaryName: string
  secondaryName: string
  primaryColor: string
  secondaryColor: string
  distanceKm: number
  realMissions: string[]
  families: FamilyMeta[]
}

export interface SearchEntry {
  type: "system" | "family" | "concept"
  systemId?: string
  familyId?: string
  label: string
  description: string
  tags: string[]
}

export const SYSTEMS: CRSystem[] = [
  {
    id: "earth-moon",
    label: "Earth-Moon",
    description: "The Earth-Moon system is the gateway to cislunar space. Lagrange points L1 and L2 sit roughly 60,000 km from the Moon and are prime staging locations for deep space exploration. NASA's Gateway station will orbit in a Near-Rectilinear Halo Orbit around L2.",
    funFact: "A spacecraft can travel from an L2 halo orbit to the lunar surface using almost no fuel by riding the natural manifold tubes — the gravitational highways of the Earth-Moon system.",
    mu: 0.01215058560962404,
    primaryName: "Earth",
    secondaryName: "Moon",
    primaryColor: "#4488ff",
    secondaryColor: "#aaaaaa",
    distanceKm: 384400,
    realMissions: ["CAPSTONE (2022)", "Artemis I (2022)", "Gateway (planned)", "GRAIL (2011)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "3D periodic orbits around collinear Lagrange points. JWST flies one at Sun-Earth L2.",
        color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2, 3], availableBranches: [],
        description: "Planar periodic orbits in the orbital plane of the primaries.",
        color: "#00FFFF" },
      { id: "dro", label: "Distant Retrograde", requiresLibr: false, requiresBranch: false,
        availableLibr: [], availableBranches: [],
        description: "Stable retrograde orbits far from the Moon. Highly robust to perturbations.",
        color: "#FFD700" },
      { id: "butterfly", label: "Butterfly", requiresLibr: false, requiresBranch: true,
        availableLibr: [], availableBranches: ["N", "S"],
        description: "Figure-eight orbits passing over both poles of the Moon.",
        color: "#BB86FC" },
      { id: "nrho", label: "Near-Rectilinear Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [2], availableBranches: ["N", "S"],
        description: "Highly elongated halo orbits with close lunar passes. Gateway's planned orbit.",
        color: "#FFD700" },
    ]
  },
  {
    id: "sun-earth",
    label: "Sun-Earth",
    description: "The Sun-Earth system has Lagrange points at vastly larger scales. L2 sits 1.5 million km from Earth in the anti-sun direction — a perfect location for space telescopes that need a stable thermal environment. L4 and L5 host the natural Trojan asteroid populations.",
    funFact: "The James Webb Space Telescope orbits the Sun-Earth L2 point right now, using its sunshield to stay permanently in Earth's shadow. It was inserted there via a low-energy manifold transfer.",
    mu: 3.003480e-6,
    primaryName: "Sun",
    secondaryName: "Earth",
    primaryColor: "#FFD700",
    secondaryColor: "#4488ff",
    distanceKm: 149597870,
    realMissions: ["JWST (L2, 2021–)", "SOHO (L1, 1995–)", "Gaia (L2, 2013–)", "WMAP (L2, 2001–2010)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "JWST flies a northern halo orbit around Sun-Earth L2.",
        color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2], availableBranches: [],
        description: "Planar periodic orbits in the Sun-Earth rotating frame.",
        color: "#00FFFF" },
      { id: "dro", label: "Distant Retrograde", requiresLibr: false, requiresBranch: false,
        availableLibr: [], availableBranches: [],
        description: "Large stable retrograde orbits in the Sun-Earth system.",
        color: "#FFD700" },
    ]
  },
  {
    id: "jupiter-europa",
    label: "Jupiter-Europa",
    description: "Europa's subsurface ocean makes this one of the most scientifically exciting systems in the solar system. The tiny mass ratio creates very different manifold geometry — tighter, more intricate structures near Europa's Lagrange points.",
    funFact: "NASA's Europa Clipper, launched in October 2024, will perform 49 close flybys of Europa. It uses Jupiter-Europa libration point dynamics for fuel-efficient trajectory design.",
    mu: 2.528017e-5,
    primaryName: "Jupiter",
    secondaryName: "Europa",
    primaryColor: "#C88B3A",
    secondaryColor: "#C2B280",
    distanceKm: 671100,
    realMissions: ["Europa Clipper (2024–)", "Galileo (1995–2003)", "Juno (flyby 2022)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "3D periodic orbits around Europa's Lagrange points.", color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2], availableBranches: [],
        description: "Planar periodic orbits in Jupiter-Europa rotating frame.", color: "#00FFFF" },
      { id: "dro", label: "Distant Retrograde", requiresLibr: false, requiresBranch: false,
        availableLibr: [], availableBranches: [],
        description: "Stable retrograde orbits providing long-term Europa coverage.", color: "#FFD700" },
    ]
  },
  {
    id: "saturn-enceladus",
    label: "Saturn-Enceladus",
    description: "Enceladus actively vents water vapor and ice from its south pole, forming Saturn's E ring. The tiny mass ratio creates extremely tight manifold structures near Enceladus. A spacecraft riding a stable manifold inward could sample the geysers without even landing.",
    funFact: "Enceladus shoots water geysers 500 km into space from cracks called tiger stripes. The ejected material contains organic molecules and silica — ingredients for life as we know it.",
    mu: 1.901e-7,
    primaryName: "Saturn",
    secondaryName: "Enceladus",
    primaryColor: "#E8D5A3",
    secondaryColor: "#EEEEEE",
    distanceKm: 238020,
    realMissions: ["Cassini (21 flybys, 2005–2017)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "3D periodic orbits around Enceladus Lagrange points.", color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2], availableBranches: [],
        description: "Planar periodic orbits in Saturn-Enceladus rotating frame.", color: "#00FFFF" },
    ]
  },
  {
    id: "saturn-titan",
    label: "Saturn-Titan",
    description: "Titan is the only moon in the solar system with a thick atmosphere and surface liquids — lakes of liquid methane. The Saturn-Titan mass ratio is much larger than Saturn-Enceladus, producing richer manifold structures.",
    funFact: "NASA's Dragonfly mission will fly a drone rotorcraft on Titan in the 2030s. Titan's thick atmosphere and low gravity make this possible with a relatively small vehicle.",
    mu: 2.366e-4,
    primaryName: "Saturn",
    secondaryName: "Titan",
    primaryColor: "#E8D5A3",
    secondaryColor: "#D4A017",
    distanceKm: 1221830,
    realMissions: ["Cassini (flybys)", "Huygens probe (2005)", "Dragonfly (planned 2030s)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "3D periodic orbits around Titan's Lagrange points.", color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2], availableBranches: [],
        description: "Planar periodic orbits in Saturn-Titan rotating frame.", color: "#00FFFF" },
      { id: "dro", label: "Distant Retrograde", requiresLibr: false, requiresBranch: false,
        availableLibr: [], availableBranches: [],
        description: "Stable large retrograde orbits in the Saturn-Titan system.", color: "#FFD700" },
    ]
  },
  {
    id: "mars-phobos",
    label: "Mars-Phobos",
    description: "Phobos orbits Mars so closely that it rises and sets twice per Martian day — and it is slowly spiraling inward. The Mars-Phobos mass ratio is tiny, creating very tight manifold structures. Phobos is seen as a potential staging point for Mars surface missions.",
    funFact: "Phobos will either crash into Mars or break apart into a ring system in about 50 million years. JAXA's MMX mission will return a sample from Phobos in the early 2030s.",
    mu: 1.667e-8,
    primaryName: "Mars",
    secondaryName: "Phobos",
    primaryColor: "#C1440E",
    secondaryColor: "#A0785A",
    distanceKm: 9376,
    realMissions: ["MMX — Martian Moons eXploration (JAXA, planned 2026 launch)"],
    families: [
      { id: "halo", label: "Halo", requiresLibr: true, requiresBranch: true,
        availableLibr: [1, 2], availableBranches: ["N", "S"],
        description: "3D periodic orbits near Phobos Lagrange points.", color: "#FFFFFF" },
      { id: "lyapunov", label: "Lyapunov", requiresLibr: true, requiresBranch: false,
        availableLibr: [1, 2], availableBranches: [],
        description: "Planar periodic orbits in Mars-Phobos rotating frame.", color: "#00FFFF" },
    ]
  }
]

export const CONCEPTS: SearchEntry[] = [
  {
    type: "concept",
    label: "Lagrange Points",
    description: "Five special positions in a two-body system where the gravitational forces and the centrifugal force of the rotating frame exactly balance. L1, L2, L3 lie on the line between the two bodies and are unstable. L4 and L5 form equilateral triangles with the two bodies and are stable, hosting natural asteroid populations.",
    tags: ["lagrange", "L1", "L2", "L3", "L4", "L5", "equilibrium", "gravity", "balance"]
  },
  {
    type: "concept",
    label: "Invariant Manifolds",
    description: "Tubes of natural trajectories that flow toward (stable) or away from (unstable) a periodic orbit. They are like gravitational highways — a spacecraft placed on an unstable manifold will drift away from the orbit for free; on a stable manifold it will coast toward the orbit for free. Spacecraft use these for extremely fuel-efficient transfers.",
    tags: ["manifold", "stable", "unstable", "tube", "transfer", "highway", "free", "fuel"]
  },
  {
    type: "concept",
    label: "Halo Orbit",
    description: "A three-dimensional periodic orbit around a collinear Lagrange point. They appear as halos around the Lagrange point when viewed from the primary. JWST flies a halo orbit around Sun-Earth L2. The Gateway station will orbit in a special halo called an NRHO around Earth-Moon L2.",
    tags: ["halo", "3D", "periodic", "JWST", "gateway", "NRHO", "three dimensional"]
  },
  {
    type: "concept",
    label: "Lyapunov Orbit",
    description: "A planar periodic orbit in the orbital plane of the two bodies. Simpler than halo orbits — entirely 2D. They exist around all five Lagrange points but are most commonly used around L1, L2, and L3.",
    tags: ["lyapunov", "planar", "2D", "periodic", "orbit", "collinear"]
  },
  {
    type: "concept",
    label: "Low-Energy Transfer",
    description: "A trajectory that exploits manifold tubes to travel between orbits using almost no fuel. These transfers take longer than direct routes but can reduce the fuel cost of a maneuver by orders of magnitude. The Interplanetary Transport Network describes a web of these transfers connecting the solar system.",
    tags: ["low energy", "transfer", "fuel", "delta-v", "efficient", "interplanetary", "network"]
  },
  {
    type: "concept",
    label: "Jacobi Constant",
    description: "The only conserved quantity in the CR3BP — analogous to energy in a simpler system. It defines which regions of space a spacecraft can physically reach: lower Jacobi constant means more freedom of movement. Orbits within the same family share similar Jacobi constants.",
    tags: ["jacobi", "constant", "energy", "conservation", "forbidden region", "zero velocity"]
  },
  {
    type: "concept",
    label: "CR3BP",
    description: "The Circular Restricted Three-Body Problem. A mathematical model describing the motion of a small body (spacecraft) under the gravity of two massive bodies orbiting each other in circles. It cannot be solved analytically — trajectories must be computed numerically. Despite its simplifications it captures the essential dynamics used for real mission design.",
    tags: ["CR3BP", "three body", "restricted", "circular", "model", "dynamics", "equations"]
  },
  {
    type: "concept",
    label: "Monodromy Matrix",
    description: "A matrix that describes what happens to nearby trajectories after one full orbit period. Its eigenvalues reveal the stability of an orbit: eigenvalues with magnitude greater than 1 mean nearby trajectories diverge (unstable). The eigenvectors point in the directions of the manifold tubes.",
    tags: ["monodromy", "matrix", "stability", "eigenvalue", "eigenvector", "STM", "period"]
  }
]

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = []

  for (const sys of SYSTEMS) {
    entries.push({
      type: "system",
      systemId: sys.id,
      label: sys.label,
      description: sys.description,
      tags: [sys.label, sys.primaryName, sys.secondaryName, ...sys.realMissions, "system", "CR3BP"]
    })
    for (const fam of sys.families) {
      entries.push({
        type: "family",
        systemId: sys.id,
        familyId: fam.id,
        label: `${fam.label} — ${sys.label}`,
        description: fam.description,
        tags: [fam.label, fam.id, sys.label, sys.primaryName, sys.secondaryName, "orbit", "family"]
      })
    }
  }

  return [...entries, ...CONCEPTS]
}
