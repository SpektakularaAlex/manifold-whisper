# Manifold — Cislunar Space Mission Design, Reimagined

> *"Before Europeans could cross the Atlantic efficiently, they mapped the ocean currents — the invisible highways of the sea. We are at that same moment in space exploration. Manifold maps the gravitational highways of cislunar space."*

**Built at AITX Hackathon 2025 · Agents Track**


---

## What Is This?

Manifold is a natural-language interface for cislunar astrodynamics. Type (or eventually speak) a command like *"show me the L2 halo family and its unstable manifold"* and the system computes and renders physically-accurate orbital trajectories in real time — including the invariant manifold tubes that serve as near-zero-ΔV gravitational highways through the Earth-Moon system.

It is aimed at space mission designers, astrodynamics researchers, and anyone who wants to explore cislunar space without needing to write a single line of trajectory code.

---

## Why It Matters

Cislunar space — the region between Earth and the Moon — is becoming the most strategically important region in the solar system. NASA's Artemis program, commercial lunar landers, and the Gateway station are all operating here. But designing fuel-efficient missions in this environment requires understanding a rich gravitational structure that has historically been accessible only to specialists with dedicated tools.

The invariant manifolds of the three-body problem are gravitational highways: tube-like structures along which spacecraft can travel between orbits with near-zero fuel expenditure. Manifold makes these structures explorable through natural language, in real time, in a browser.

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- OpenAI API key (GPT-4o)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/manifold-whisper.git
cd manifold-whisper
```

### 2. Backend setup

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```env
OPENAI_API_KEY=sk-...your-key-here...
ALLOWED_ORIGINS=http://localhost:5173
```

Start the backend:
```bash
python3 -m uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`. On startup it loads 14,615 orbit initial conditions from the local CSV database — no internet required.

### 3. Frontend setup

```bash
cd ../frontend   # or wherever your src/ lives
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 4. Verify everything works

```bash
# Should return all 13 families with orbit counts
curl http://localhost:8000/health

# Should return family metadata with Jacobi ranges
curl http://localhost:8000/families

# Should return 5 computed halo orbits
curl "http://localhost:8000/family/halo_L2_N?n=5"
```

---

## Demo Walkthrough (Reproduce the Demo)

1. **Load the scene** — Earth, Moon, 5000 stars, and Lagrange point markers appear automatically
2. **Type or click** "L2 Halo family" — 20 halo orbits render color-coded by Jacobi energy (blue → red)
3. **Drag the Jacobi slider** — individual orbits highlight; period and stability update live
4. **Click "Show Manifolds"** — red (unstable) and blue (stable) manifold tubes fan out from the orbit
5. **Activate Mission Planner** — click two orbits from any families, hit "Plan Transfer" — a spacecraft animates along the manifold-guided trajectory

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER (Browser)                       │
│              Natural language / UI controls                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────┐
│              React 19 + Three.js Frontend                   │
│  TanStack Start · useScene.ts · FamilyBrowserPanel          │
│  TransferPlannerPanel · ChatInput · TrajectoryInfoPanel     │
│  Post-processing: UnrealBloomPass                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /agent  GET /family  POST /manifold
┌───────────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend (Python)                   │
│                                                             │
│  agent.py      GPT-4o parses NL → structured JSON commands  │
│  ic_cache.py   Loads 14,615 orbit ICs from CSV at startup   │
│  cr3bp.py      EOM, DOP853 integrator, STM propagation      │
│  manifolds.py  Monodromy matrix, eigenvector perturbation,  │
│                80-branch manifold tube computation          │
│  mission.py    Multi-leg trajectory builder                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    IC_Orbits/ Database                      │
│         13 CSV files · 14,615 orbit initial conditions      │
│              Sourced from JPL Three-Body Periodic           │
│                    Orbits API (cached locally)              │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19, TanStack Start, Vite |
| 3D rendering | Three.js, UnrealBloomPass |
| Backend | FastAPI, Python 3.11 |
| ODE integrator | SciPy `solve_ivp` DOP853 (8th order Runge-Kutta) |
| LLM / NL parsing | OpenAI GPT-4o (JSON mode) |
| Physics model | Circular Restricted Three-Body Problem (CR3BP) |
| Orbit database | JPL Three-Body Periodic Orbits API (local CSV cache) |

---

## Datasets & Provenance

All orbit initial conditions are sourced from the **JPL Solar System Dynamics Three-Body Periodic Orbits API**:

> https://ssd-api.jpl.nasa.gov/periodic_orbits.api

The `IC_Orbits/` folder contains 13 CSV files downloaded from this API, covering:

| File | Family | Orbits |
|------|--------|--------|
| `L1_Halo_Northern.csv` | L1 North Halo | ~1,800 |
| `L1_Halo_Southern.csv` | L1 South Halo | ~1,800 |
| `L2_Halo_Northern.csv` | L2 North Halo | ~1,800 |
| `L2_Halo_Southern.csv` | L2 South Halo | ~200 |
| `L3_Halo_Northern.csv` | L3 North Halo | ~200 |
| `L3_Halo_Southern.csv` | L3 South Halo | ~200 |
| `L1_Lyapunov.csv` | L1 Lyapunov | ~1,200 |
| `L2_Lyapunov.csv` | L2 Lyapunov | ~1,200 |
| `L3_Lyapunov.csv` | L3 Lyapunov | ~200 |
| `Butterfly_Northern.csv` | Butterfly North | ~1,200 |
| `Butterfly_Southern.csv` | Butterfly South | ~1,200 |
| `Dragonfly_Northern.csv` | Dragonfly North | ~1,200 |
| `Dragonfly_Southern.csv` | Dragonfly South | ~1,200 |

All data is in non-dimensional CR3BP units (LU, TU) with μ = 0.01215058560962404.
JPL data is public domain. No synthetic data was generated — all ICs are numerically verified periodic orbits.

---

## Physics — How It Works

The backend implements the full 3D Circular Restricted Three-Body Problem:

**Equations of motion** (rotating frame, non-dimensional):
```
ẍ − 2ẏ = x − (1−μ)(x+μ)/r₁³ − μ(x−1+μ)/r₂³
ÿ + 2ẋ = y − (1−μ)y/r₁³ − μy/r₂³
z̈      = −(1−μ)z/r₁³ − μz/r₂³
```

**Manifold computation** uses the State Transition Matrix (STM) eigenvector method:
1. Integrate the 42-dimensional augmented system (6 EOM + 36 STM elements) with DOP853
2. Extract monodromy matrix M = Φ(T) at one full period
3. Find unstable/stable eigenvectors of M
4. Map eigenvectors along the orbit using Φ(tᵢ)·v₀ with sign-consistency enforcement
5. Perturb and propagate 80 branches (ε = 1e-5) forward/backward for up to 3× the orbit period

---

## Environment Variables

```env
# backend/.env
OPENAI_API_KEY=sk-...          # Required — GPT-4o for natural language parsing
ALLOWED_ORIGINS=http://localhost:5173   # CORS origin for local dev
```

```env
# frontend/.env (or .env.local)
VITE_API_URL=http://localhost:8000     # Backend URL
```

For production deployment:
```env
VITE_API_URL=https://your-app.railway.app
ALLOWED_ORIGINS=https://your-app.netlify.app
```

---

## Known Limitations & Next Steps

### Current Limitations

- **No ΔV computation**: manifold departures/arrivals are treated as free (physically correct for the manifold surface itself, but the intersection patch burn is not computed)
- **No differential correction at runtime**: all periodic orbit ICs come from the pre-loaded CSV database — computing new orbits dynamically is not implemented
- **Transfer arc is approximate**: the connecting arc between manifold tubes uses closest-approach interpolation, not a full heteroclinic connection finder
- **Sun-Earth system not supported**: only Earth-Moon CR3BP
- **No voice input**: text only in v1
- **Camera presets**: top/side view presets not yet implemented

### Next Steps

- **ΔV budget computation** — impulsive maneuver costs at manifold intersections using variational methods
- **Differential correction** — compute new periodic orbits at runtime using single/multiple shooting
- **Poincaré section viewer** — visualize tube intersections with surfaces of section for heteroclinic connection finding
- **Sun-Earth L2 support** — extend to the Sun-Earth system for deep space mission planning
- **Voice interface** — Whisper-based voice input for hands-free orbit exploration
- **Export to GMAT/STK** — generate trajectory files compatible with industry tools
- **NRHO / Gateway analysis** — specialized tools for Near Rectilinear Halo Orbit station-keeping

---

## Team

| Name | Role |
|------|------|
| Alexander Cremer | Astrodynamics researcher, full-stack, physics engine |

*Visiting researcher from Sweden, specializing in cislunar astrodynamics and periodic orbit continuation methods.*


---

*Built at AITX Hackathon, Austin TX, May 2025.*
