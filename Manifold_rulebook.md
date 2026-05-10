# MANIFOLD — Project Rulebook
### CR3BP Cislunar Mission Design Visualizer
*Last updated: May 2026 — Update this file as the project evolves*

---

## 1. What This Is

**Manifold** is an interactive, browser-based 3D visualization tool for exploring cislunar orbital dynamics using the Circular Restricted Three-Body Problem (CR3BP). Users interact with it through natural language — typing or speaking commands — and the system computes and renders trajectories, periodic orbits, invariant manifolds, and transfer arcs in real time.

**The one-line pitch:**  
*"Tell it what you want to see in space, and it shows you — beautifully."*

**Primary scope: Earth-Moon CR3BP system** (cislunar space). Sun-Earth system is future work.

---

## 2. Architecture

```
Frontend (React + Three.js + Vite)
    ↕ HTTPS REST
Backend (FastAPI + Python)
    ├── CR3BP Engine        (numpy + scipy)
    ├── IC Library          (ics.json — hardcoded verified ICs)
    ├── Manifold Propagator (eigenvector perturbation)
    └── Agent Layer         (Anthropic Claude API)

Hosting:
    Frontend → Netlify (GitHub auto-deploy)
    Backend  → Railway.app (FastAPI + uvicorn)
```

### Why This Split
- CR3BP math stays in Python where it is well-tested and fast
- Three.js rendering stays in JS where the ecosystem is richest
- Claude runs server-side (API key never exposed to browser)
- Each layer is independently replaceable

---

## 3. Repository Structure

```
manifold/
├── frontend/                   # React + Vite app (Lovable origin)
│   ├── src/
│   │   ├── components/
│   │   │   ├── SpaceScene.jsx      # Three.js canvas — all 3D
│   │   │   ├── ChatPanel.jsx       # NL input + agent response
│   │   │   ├── InfoPanel.jsx       # Agent explanation text sidebar
│   │   │   └── ControlPanel.jsx    # Optional manual parameter sliders
│   │   ├── hooks/
│   │   │   ├── useScene.js         # Three.js scene state management
│   │   │   └── useAgent.js         # API calls to backend /agent
│   │   ├── utils/
│   │   │   └── sceneCommands.js    # Maps agent JSON → Three.js calls
│   │   └── App.jsx
│   ├── public/
│   │   └── textures/               # Earth, Moon NASA texture maps
│   ├── .env                        # VITE_API_URL=https://your.railway.app
│   └── package.json
│
├── backend/                    # FastAPI Python app
│   ├── main.py                     # FastAPI app, all endpoints
│   ├── cr3bp.py                    # EOM, propagator, STM
│   ├── manifolds.py                # Manifold tube computation
│   ├── agent.py                    # Claude integration, prompt
│   ├── ics.json                    # Verified initial conditions library
│   ├── requirements.txt
│   └── Dockerfile                  # For Railway deployment
│
├── MANIFOLD_RULEBOOK.md        # This file
└── README.md
```

---

## 4. CR3BP Engine Rules

### 4.1 Non-Dimensionalization
All internal computation is in **non-dimensional CR3BP units**:
- Length unit (LU): Earth-Moon distance = 384,400 km
- Time unit (TU): 1/ω where ω = mean motion = 2π / 27.3 days
- Mass parameter: μ = 0.01215058560962404 (Earth-Moon)

**Never mix dimensional and non-dimensional quantities in the same function.**
Always document units in function docstrings.

### 4.2 Equations of Motion
Standard rotating frame CR3BP:
```
ẍ - 2ẏ = ∂Ω/∂x
ÿ + 2ẋ = ∂Ω/∂y
z̈     = ∂Ω/∂z

where Ω = ½(x² + y²) + (1-μ)/r₁ + μ/r₂
```

### 4.3 Integrator
- Use scipy.integrate.solve_ivp with method='DOP853'
- Tolerances: rtol=1e-10, atol=1e-12
- Never use RK45 for orbital mechanics — DOP853 only
- Default output: 500 points per trajectory

### 4.4 IC Library (ics.json)
- **Never compute ICs from scratch at request time.** Always look up from ics.json.
- ICs sourced from Richardson (1980) 3rd-order analytical approximation, then verified by forward propagation confirming periodicity (|Δstate| < 1e-8 after one period).
- Each IC entry must include: state [x,y,z,vx,vy,vz], period, jacobi_constant, family, libration_point, z_amplitude (for halos).
- Supported families at launch: lyapunov_L1, lyapunov_L2, halo_L1_north, halo_L1_south, halo_L2_north, halo_L2_south, nrho

### 4.5 Manifold Computation
- Compute STM by integrating alongside EOM (6+36 coupled ODEs)
- Extract monodromy matrix M = STM(T)
- Unstable eigenvector: eigenvector of M with |λ| > 1
- Stable eigenvector: eigenvector of M with |λ| < 1
- Perturbation magnitude: ε = 1e-6 (non-dimensional)
- Default: 40 branches per manifold, propagated for T = 3.0 TU

---

## 5. Agent Layer Rules

### 5.1 What the Agent Does
Claude receives the user's natural language input and returns a structured JSON command that the backend executes. It also generates a plain-English explanation for the InfoPanel.

### 5.2 Agent Response Schema
Every agent response must conform to:
```json
{
  "commands": [
    {
      "action": "show_orbit | show_manifold | show_transfer | clear | camera_move | show_lagrange",
      "params": {}
    }
  ],
  "explanation": "2-3 sentence plain English explanation, accessible to non-experts",
  "suggested_next": "One follow-up prompt the user might find interesting"
}
```

Multiple commands are allowed (e.g. show orbit + show manifold together).

### 5.3 Agent Constraints
- The agent must ONLY issue commands from the defined command schema
- If a request is outside current capabilities, it must say so clearly and suggest what IS possible
- The agent must never hallucinate orbital mechanics facts
- All parameter values must be valid (checked against IC library before response)
- The agent should always explain WHY something looks the way it does, not just WHAT it is

### 5.4 Tone of Explanations
- Assume the user is intelligent but not necessarily an astrodynamicist
- Lead with the intuitive concept, then the mechanics
- Use analogies freely ("think of manifold tubes as gravitational highways")
- Never use unexplained jargon without a brief gloss

---

## 6. Frontend / Three.js Rules

### 6.1 Scene Composition
The Three.js scene always contains:
- Earth (textured sphere, radius scaled to scene)
- Moon (textured sphere, correctly scaled and positioned)
- Lagrange points L1-L5 as glowing point indicators (shown on demand)
- Starfield background (static THREE.Points, ~5000 stars)
- Ambient + directional lighting mimicking sunlight

### 6.2 Visual Color Language
Maintain consistent color coding throughout:

| Object              | Color              | Style                        |
|---------------------|--------------------|------------------------------|
| Lyapunov orbits     | #00FFFF cyan       | Thin tube, glowing           |
| Halo orbits         | #FFFFFF white      | Medium tube, glowing         |
| NRHO                | #FFD700 gold       | Medium tube, glowing         |
| Unstable manifolds  | #FF6B35 orange     | Thin tubes, semi-transparent |
| Stable manifolds    | #4FC3F7 ice blue   | Thin tubes, semi-transparent |
| Transfer arcs       | #B39DDB lavender   | Highlighted, animated        |
| Lagrange points     | #FFFF00 yellow     | Pulsing sphere + label       |

### 6.3 Post-Processing (Non-Negotiable)
Always use UnrealBloomPass from Three.js postprocessing:
- strength: 1.2
- radius: 0.8
- threshold: 0.1

Without bloom the demo loses its visual impact entirely. This is not optional.

### 6.4 Camera
- Default: OrbitControls — mouse drag to rotate, scroll to zoom, right-click to pan
- Camera move commands from agent use smooth TWEEN.js animation, never instant jumps
- Default starting position: looking at Earth-Moon system from ~30° above orbital plane
- Always maintain Z-axis as "up" (matches CR3BP rotating frame)

### 6.5 Particle Animation
Every trajectory rendered must have animated particles flowing along it showing direction of motion. Use THREE.Points interpolated along the trajectory array, cycling with modulo time. Static tubes alone feel dead — particles are required.

### 6.6 Performance Budget
- Maximum simultaneous trajectory objects: 20 (prune oldest if exceeded)
- Manifold branches: max 40 tubes per manifold
- Each tube: max 200 segments
- Target: 60fps on a modern laptop

---

## 7. API Endpoints

```
POST /agent       NL input → JSON command + explanation
POST /orbit       {family, lp, index} → {trajectory[], metadata}
POST /manifold    {orbit_id, type, n_branches} → {tubes[][]}
POST /transfer    {from_orbit, to_orbit} → {arc[]}
GET  /health      {status: "ok"}
```

All trajectory data returned as arrays of [x, y, z] in non-dimensional units.
Frontend is responsible for scaling to display coordinates.

---

## 8. Environment Variables

### Frontend (.env / Netlify dashboard)
```
VITE_API_URL=https://your-app.railway.app
```

### Backend (Railway dashboard)
```
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_ORIGINS=https://your-app.netlify.app
```

**Never commit API keys to git. Ever.**

---

## 9. Scope: What This Is NOT (v1)

Explicitly out of scope to stay shippable:

- N-body propagation (CR3BP only)
- Perturbations (SRP, J2, lunar harmonics)
- Differential correction at runtime
- Delta-V optimization
- Sun-Earth system (future work)
- User accounts or session saving
- Mobile support
- Voice input (text only for v1)

If a user asks for out-of-scope features, the agent explains the limitation and redirects.

---

## 10. The Demo Script

Practice this until it runs in exactly 90 seconds:

1. **"Show me the Earth-Moon system and its Lagrange points"**
   → Five glowing points appear. Agent explains what Lagrange points are.

2. **"Show me a halo orbit around L2 and its unstable manifold"**
   → White halo appears, orange tubes fan out. Agent explains "gravitational highways."

3. **"Design a transfer from the L2 halo to the Moon"**
   → Lavender arc threads from manifold to lunar vicinity, particles flow along it.

This is the sequence that wins. Everything else is secondary.

---

## 11. Change Log

| Date     | Change                  | Reason          |
|----------|-------------------------|-----------------|
| May 2026 | Initial rulebook created | Project kickoff |

---

*"The goal is not to show that CR3BP is complicated. The goal is to show that space has structure — and that structure is beautiful."*