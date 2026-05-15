# MANIFOLD — Project Rulebook v2
### Multi-System CR3BP Orbital Dynamics Visualizer
*Last updated: May 2026*

---

## 1. What This Is

**Manifold** is an interactive, browser-based 3D visualization tool for exploring orbital dynamics across multiple CR3BP systems. Users interact through a structured control panel and fuzzy search bar — no LLM required. The system computes and renders periodic orbits, invariant manifolds, and transfer arcs in real time using verified initial conditions from the JPL Three-Body Periodic Orbit Catalog.

**The one-line pitch:**
*"See the invisible highways of space — beautifully."*

**Version history:**
- v1 (hackathon, May 2026): Earth-Moon only, LLM natural language interface, won AITX Hackathon
- v2 (current): Multi-system CR3BP, no LLM, structured UI + fuzzy search, free to host

---

## 2. Architecture

```
Frontend (React + Vite + TanStack Start)
    ↕ HTTPS REST (native fetch, no axios)
Backend (FastAPI + Python)
    ├── CR3BP Engine     (numpy + scipy DOP853)
    ├── IC Cache         (JPL API + hardcoded fallbacks)
    └── Manifold Engine  (STM + eigenvector perturbation)

Hosting:
    Frontend → Cloudflare Pages (free tier)
    Backend  → Railway.app (free tier)

NO LLM. NO API KEY REQUIRED FOR CORE FEATURES.
```

### Why This Split
- CR3BP math stays in Python — well-tested, fast, scipy ecosystem
- Three.js rendering stays in JS — richest ecosystem for 3D browser graphics
- No agent layer — all interaction is structured UI + fuzzy search
- Each layer is independently replaceable

---

## 3. Repository Structure

```
manifold-whisper/
├── src/
│   ├── components/
│   │   └── manifold/
│   │       ├── SceneContainer.tsx      # Three.js mount point — DO NOT TOUCH
│   │       ├── InfoPanel.tsx           # LEFT: system info + concept display
│   │       ├── SystemControlPanel.tsx  # BOTTOM: orbit family controls (NEW v2)
│   │       ├── SystemMiniMap.tsx       # BOTTOM-RIGHT: solar system switcher (NEW v2)
│   │       ├── SearchBar.tsx           # TOP: fuzzy search (NEW v2)
│   │       ├── SceneControls.tsx       # TOP-RIGHT: camera, clear, labels
│   │       ├── TrajectoryInfoPanel.tsx # BOTTOM-RIGHT: click-to-inspect
│   │       └── MissionPanel.tsx        # Mission builder + display
│   ├── data/
│   │   └── systems.ts                  # All system metadata (NEW v2)
│   ├── hooks/
│   │   └── useScene.ts                 # Three.js scene — NEVER MODIFY
│   ├── utils/
│   │   └── sceneCommands.ts            # Trajectory/tube → Three.js calls
│   └── routes/
│       └── index.tsx                   # Main page wiring
│
├── backend/
│   ├── main.py                         # FastAPI, all endpoints
│   ├── cr3bp.py                        # EOM, STM, propagator
│   ├── manifolds.py                    # Manifold tube computation
│   ├── ic_cache.py                     # JPL fetch + fallbacks + MU_BY_SYSTEM
│   ├── mission.py                      # Multi-leg mission builder
│   ├── requirements.txt
│   └── Dockerfile
│
├── MANIFOLD_RULEBOOK.md
└── README.md
```

---

## 4. Supported CR3BP Systems

All systems use the JPL Three-Body Periodic Orbit Catalog API:
`https://ssd-api.jpl.nasa.gov/periodic_orbits.api`

| System ID        | Primary  | Secondary  | μ                    | Real Missions              |
|------------------|----------|------------|----------------------|----------------------------|
| earth-moon       | Earth    | Moon       | 0.01215058560962404  | CAPSTONE, Gateway, Artemis |
| sun-earth        | Sun      | Earth      | 3.003480e-6          | JWST, SOHO, Gaia           |
| jupiter-europa   | Jupiter  | Europa     | 2.528017e-5          | Europa Clipper             |
| saturn-enceladus | Saturn   | Enceladus  | 1.901e-7             | Cassini                    |
| saturn-titan     | Saturn   | Titan      | 2.366e-4             | Dragonfly (planned)        |
| mars-phobos      | Mars     | Phobos     | 1.667e-8             | MMX (JAXA, planned)        |

### μ Lookup Rule
Every backend computation must use the μ for the requested system.
Never hardcode μ = 0.01215 for non-Earth-Moon requests.
`ic_cache.py` is the single source of truth for μ values via `MU_BY_SYSTEM`.

### IC Cache Key Format
Keys are prefixed with system ID:
  `"earth-moon:halo_L2_N"` not `"halo_L2_N"`
This prevents cross-system IC contamination.

---

## 5. CR3BP Engine Rules

### 5.1 Non-Dimensionalization
All computation uses non-dimensional CR3BP units per system:
- Length unit (LU): distance between primaries (varies per system)
- Time unit (TU): 1/ω where ω = mean motion of the system
- Mass parameter: μ as defined in the system table above

Never mix systems in a single computation.
Never hardcode μ — always pass it as a parameter.

### 5.2 Equations of Motion (unchanged)
Standard rotating frame CR3BP:
  ẍ - 2ẏ = ∂Ω/∂x
  ÿ + 2ẋ = ∂Ω/∂y
  z̈     = ∂Ω/∂z
  where Ω = ½(x² + y²) + (1-μ)/r₁ + μ/r₂

### 5.3 Integrator (unchanged)
- scipy.integrate.solve_ivp, method='DOP853'
- rtol=1e-10, atol=1e-12. Never use RK45.
- Default: 500 points per trajectory

### 5.4 IC Sources (priority order)
1. JPL API (fetched on startup per system, cached in memory)
2. Local disk cache (ics_cache.json)
3. Hardcoded fallbacks (HARDCODED_FALLBACK_ICS — Earth-Moon only)

If a family is unavailable: return a clear HTTP error, never wrong data.

### 5.5 Manifold Computation (unchanged)
- 42D augmented ODE (eom_with_stm_3d) for orbit + STM
- Monodromy M = Φ(T), eigenvectors selected by |λ|
- Branch eigenvectors: v(tᵢ) = Φ(tᵢ) @ v₀, normalized
- Unstable: largest |λ|, ±ε → n_branches/2 tubes each direction
- Stable: smallest non-zero |λ|, backward integration
- Defaults: 40 branches, ε=1e-6, T_prop=3.0 TU
- Filter: discard tubes with any point > 20 LU

---

## 6. API Endpoints

```
GET  /health
     Returns: {status, families_loaded}

POST /orbit
     Body:    {family, libr, branch, index, system}
     Returns: {trajectory[[x,y,z],...], period, jacobi, total_members, metadata}
     NOTE: total_members tells frontend how large the family is

POST /manifold
     Body:    {family, libr, branch, index, type, n_branches,
               propagation_time, system}
     type:    "stable" | "unstable" | "both"
     Returns: For "both" — two response objects, one per type, each with color
              For single type — {tubes[[[x,y,z]...],...], type, color}

POST /mission
     Body:    {legs:[...], system}
     Returns: {legs[...], total_trajectory, total_duration}
```

The `system` field defaults to "earth-moon" on all POST endpoints.
Frontend never calls /agent — that endpoint no longer exists.

---

## 7. Frontend Architecture Rules

### 7.1 THE MOST IMPORTANT RULE: NEVER AUTO-CLEAR THE SCENE
handleVisualize in index.tsx must NEVER call clearTrajectories().
Users accumulate orbits by clicking "Add". They clear manually via
SceneControls "Clear" button. This enables multi-orbit comparison.

### 7.2 Interaction Model
1. SystemMiniMap (bottom-right) — switch between CR3BP systems
2. SystemControlPanel (bottom-center) — select family/orbit/manifolds, click Add
3. SearchBar (top-center) — fuzzy search systems, families, concepts
4. SceneControls (top-right) — Reset Camera, Clear All, Toggle Labels
5. Click any tube — TrajectoryInfoPanel shows orbit details
6. Mission button — opens MissionPanel builder

### 7.3 useScene.ts — NEVER MODIFY
All scene interactions go through the SceneAPI interface only:
  addTrajectory(points, color, label, metadata?) → string id
  addManifoldTubes(tubes, color) → string id
  clearTrajectories() → void
  resetCamera() → void
  showLagrangePoints(show) → void
  animateSpacecraft(path, duration) → void
  stopSpacecraft() → void

### 7.4 Manifold Color Rule
Unstable manifolds: ALWAYS #FF6B35 (orange)
Stable manifolds:   ALWAYS #4FC3F7 (ice blue)
When type="both": make TWO separate fetch calls, render each color separately.
Never use a single color for both.

### 7.5 Visual Color Language (unchanged)

| Object             | Color   | Style                        |
|--------------------|---------|------------------------------|
| Lyapunov orbits    | #00FFFF | Thin tube, glowing           |
| Halo orbits        | #FFFFFF | Medium tube, glowing         |
| NRHO               | #FFD700 | Medium tube, glowing         |
| Butterfly orbits   | #BB86FC | Medium tube, glowing         |
| DRO                | #FFD700 | Medium tube, glowing         |
| Unstable manifolds | #FF6B35 | Thin tubes, semi-transparent |
| Stable manifolds   | #4FC3F7 | Thin tubes, semi-transparent |
| Transfer arcs      | #B39DDB | Highlighted, animated        |
| Lagrange points    | #FFFF00 | Pulsing sphere + label       |
| Spacecraft dot     | #FFFFFF | Small sphere, animated       |

### 7.6 Post-Processing (non-negotiable)
UnrealBloomPass: strength 1.2, radius 0.8, threshold 0.1. Never remove.

### 7.7 Performance Budget
- Max 20 trajectory objects (prune oldest if exceeded)
- Max 40 manifold tubes per manifold
- Max 200 segments per tube
- Target: 60fps on modern laptop

---

## 8. Search (Fuse.js — client-side, zero cost)

Index built from systems.ts on mount. Three entry types: system, family, concept.
Config: threshold 0.35, keys: [label, description, tags], min 2 chars, max 6 results.

Results:
- system → switch active system, update InfoPanel with system description
- family → switch system if needed, pre-select family in SystemControlPanel
- concept → show concept explanation in InfoPanel (replaces system description)

---

## 9. InfoPanel States

State 1 (default): Shows selected system description + funFact + realMissions
State 2 (concept): Shows concept title + explanation from systems.ts
State 3 (welcome): "Select a system and orbit to begin." — shown on cold load

InfoPanel never shows agent output. All content is pre-written in systems.ts.

---

## 10. SystemControlPanel Behavior

Bottom-center, always visible.
Controls (left to right): Family ▼ | L-Point ▼ | Branch ▼ | Member ━━●━━ | Manifolds ▼ | [Add]

Rules:
- L-Point dropdown: only shown if family.requiresLibr === true
- Branch dropdown: only shown if family.requiresBranch === true
- Member slider: range 0 to (total_members - 1), updated after first fetch
- Below slider: show current Jacobi C and Period TU (read-only, from last fetch)
- Slider drag: debounced 300ms fetch, showManifolds="none" during drag
- [Add] button: calls handleVisualize, NEVER clears scene first
- System switching is done via SystemMiniMap, NOT a dropdown here

---

## 11. SystemMiniMap

Bottom-right corner, 200×200px SVG, glass panel.
Shows solar system schematic with clickable system dots.
Sun at center, systems at log-scaled orbital radii.
Selected system: pulsing ring animation.
Clicking a dot calls handleSystemChange(system).
Switching system: clears scene, updates InfoPanel, resets control panel.

---

## 12. MissionPanel

Opened via "Mission" button in SceneControls.
Allows building multi-leg missions (orbit, manifold_departure, manifold_arrival).
"Fly Mission" calls POST /mission and animates spacecraft.
Uses currently selected system for all legs.

---

## 13. Environment Variables

Frontend (.env): VITE_API_URL=http://localhost:8000
Frontend (.env.production): VITE_API_URL=https://your-app.railway.app
Backend (.env): # No API keys needed for v2

---

## 14. Out of Scope (v2)

- LLM / natural language (v3 stretch, rate-limited)
- Live satellite tracking (Phase 2)
- Solar system scale view (Phase 3)
- N-body propagation, perturbations, differential correction
- User accounts, session saving, voice input

---

## 15. Roadmap

v2: Multi-system CR3BP, structured UI, fuzzy search (current)
v3: Live satellite tracking (SGP4 + CelesTrak + satellite.js)
v4: Solar system scale + smooth zoom transition into CR3BP regions

---

## 16. Change Log

| Date     | Change                                 | Reason                      |
|----------|----------------------------------------|-----------------------------|
| May 2026 | v1 created, hackathon submission       | AITX Hackathon              |
| May 2026 | v1 won AITX Hackathon                  | —                           |
| May 2026 | v2 branch created, surgical additions  | Post-hackathon development  |

---

*"The goal is not to show that CR3BP is complicated.*
*The goal is to show that space has structure — and that structure is beautiful."*