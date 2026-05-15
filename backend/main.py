"""
Manifold — FastAPI backend

Endpoints:
    GET  /health
    POST /agent     NL → enriched JSON commands with embedded trajectory data
    POST /orbit     propagate a periodic orbit for 2 periods
    POST /manifold  compute stable/unstable manifold tubes
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load .env before importing modules that read env vars
load_dotenv()

import agent as agent_mod
import cr3bp
import ic_cache
import manifolds
import mission as mission_mod

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── Visual color language (from Manifold_rulebook.md §6.2) ────────────────────

_ORBIT_COLORS: dict[str, str] = {
    "lyapunov":   "#00FFFF",
    "halo":       "#FFFFFF",
    "halo_N":     "#FFFFFF",
    "halo_S":     "#FFFFFF",
    "dro":        "#FFD700",
    "nrho":       "#FFD700",
    "butterfly_N":"#FF6B35",
    "butterfly":  "#FF6B35",
}

_MANIFOLD_COLORS: dict[str, str] = {
    "unstable": "#FF6B35",
    "stable":   "#4FC3F7",
    "both":     "#FF6B35",   # main color; stable branches use #4FC3F7 in frontend
}


# ── Family string parsing (agent uses "halo_N", cache uses family+branch) ─────

def _parse_agent_family(agent_family: str, libr: int | None) -> tuple[str, int | None, str | None]:
    """
    Convert agent-style family string to (family, libr, branch) for ic_cache.

    Examples:
        "halo_N", 2  →  ("halo", 2, "N")
        "lyapunov", 1 → ("lyapunov", 1, None)
        "dro", None  →  ("dro", None, None)
        "butterfly_N", None → ("butterfly", None, "N")
    """
    if agent_family == "halo_N":
        return "halo", libr, "N"
    if agent_family == "halo_S":
        return "halo", libr, "S"
    if agent_family == "butterfly_N":
        return "butterfly", None, "N"
    # lyapunov, dro — no branch
    return agent_family, libr, None


def _orbit_color(agent_family: str) -> str:
    return _ORBIT_COLORS.get(agent_family, _ORBIT_COLORS.get(agent_family.split("_")[0], "#00FFFF"))


# ── Startup / shutdown ────────────────────────────────────────────────────────

FAMILY_META: dict[str, dict[str, str]] = {
    "halo_L1_N":          {"label": "L1 North Halo",        "color": "#FFFFFF"},
    "halo_L1_S":          {"label": "L1 South Halo",        "color": "#DDDDDD"},
    "halo_L2_N":          {"label": "L2 North Halo",        "color": "#AADDFF"},
    "halo_L2_S":          {"label": "L2 South Halo",        "color": "#88BBFF"},
    "halo_L3_N":          {"label": "L3 North Halo",        "color": "#FFAADD"},
    "halo_L3_S":          {"label": "L3 South Halo",        "color": "#FF88BB"},
    "lyapunov_L1":        {"label": "L1 Lyapunov",          "color": "#00FFFF"},
    "lyapunov_L2":        {"label": "L2 Lyapunov",          "color": "#00DDDD"},
    "lyapunov_L3":        {"label": "L3 Lyapunov",          "color": "#00BBBB"},
    "butterfly_N":        {"label": "Butterfly North",      "color": "#FF6B35"},
    "butterfly_S":        {"label": "Butterfly South",      "color": "#FF8C5A"},
    "dragonfly_N":        {"label": "Dragonfly North",      "color": "#FFD700"},
    "dragonfly_S":        {"label": "Dragonfly South",      "color": "#FFC200"},
    "axial_L1":           {"label": "L1 Axial",             "color": "#CC88FF"},
    "axial_L2":           {"label": "L2 Axial",             "color": "#BB77EE"},
    "axial_L3":           {"label": "L3 Axial",             "color": "#AA66DD"},
    "axial_L4":           {"label": "L4 Axial",             "color": "#9955CC"},
    "axial_L5":           {"label": "L5 Axial",             "color": "#8844BB"},
    "vertical_L1":        {"label": "L1 Vertical",          "color": "#44FF88"},
    "vertical_L2":        {"label": "L2 Vertical",          "color": "#33EE77"},
    "vertical_L3":        {"label": "L3 Vertical",          "color": "#22DD66"},
    "vertical_L4":        {"label": "L4 Vertical",          "color": "#11CC55"},
    "vertical_L5":        {"label": "L5 Vertical",          "color": "#00BB44"},
    "long_period_L4":     {"label": "L4 Long Period",       "color": "#FF9933"},
    "long_period_L5":     {"label": "L5 Long Period",       "color": "#FF7722"},
    "short_period_L4":    {"label": "L4 Short Period",      "color": "#FFCC33"},
    "short_period_L5":    {"label": "L5 Short Period",      "color": "#FFBB22"},
    "distant_prograde":   {"label": "Distant Prograde",     "color": "#00FFEE"},
    "distant_retrograde": {"label": "Distant Retrograde",   "color": "#FF44AA"},
    "low_prograde_E":     {"label": "Low Prograde (East)",  "color": "#AAFF44"},
    "low_prograde_W":     {"label": "Low Prograde (West)",  "color": "#88EE33"},
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Manifold backend...")
    logger.info("OPENAI_API_KEY present: %s", bool(os.getenv("OPENAI_API_KEY")))

    # IC cache is already populated at import time via load_all_families()
    summary = ic_cache.cache_summary()
    if summary:
        logger.info("IC cache loaded:")
        for key, count in summary.items():
            logger.info("  %-20s %4d orbits", key, count)
    else:
        logger.warning("IC cache is empty — orbit/manifold endpoints will fail.")

    yield   # server is running

    logger.info("Manifold backend shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Manifold", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────────

class AgentRequest(BaseModel):
    message: str

class OrbitRequest(BaseModel):
    family: str
    libr:   int | None = None
    branch: str | None = None
    index:  int        = 0
    system: str        = "earth-moon"

class ManifoldRequest(BaseModel):
    family:           str
    libr:             int | None = None
    branch:           str | None = None
    index:            int        = 0
    type:             str        = Field("unstable", pattern="^(stable|unstable|both)$")
    n_branches:       int        = Field(40, ge=2, le=160)
    propagation_time: float      = Field(3.0, gt=0.0, le=50.0)
    system:           str        = "earth-moon"

class MissionRequest(BaseModel):
    legs:   list[dict]
    system: str = "earth-moon"

class TransferRequest(BaseModel):
    departure_family_key: str
    departure_orbit_index: int = 0
    arrival_family_key: str
    arrival_orbit_index: int = 0


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "families_loaded": ic_cache.cache_summary()}


# ── /families ─────────────────────────────────────────────────────────────────

@app.get("/families")
async def families_endpoint():
    result: dict = {}
    for key, ics in ic_cache.IC_CACHE.items():
        if not ics:
            continue
        meta = FAMILY_META.get(key, {"label": key, "color": "#AAAAAA"})
        jacobis     = [ic["jacobi"]    for ic in ics]
        stabilities = [ic["stability"] for ic in ics]
        result[key] = {
            "count":          len(ics),
            "label":          meta["label"],
            "jacobi_min":     min(jacobis),
            "jacobi_max":     max(jacobis),
            "stability_min":  min(stabilities),
            "stability_max":  max(stabilities),
            "color":          meta["color"],
        }
    return result


# ── /family/{family_key} ──────────────────────────────────────────────────────

@app.get("/family/{family_key}")
async def family_endpoint(
    family_key: str,
    n: int = Query(20, ge=1, le=100),
):
    ics = ic_cache.IC_CACHE.get(family_key)
    if not ics:
        raise HTTPException(status_code=404, detail=f"Family '{family_key}' not found")

    total = len(ics)
    indices = [int(i * total / n) for i in range(n)] if total >= n else list(range(total))
    sampled = [(idx, ics[idx]) for idx in indices]

    loop = asyncio.get_event_loop()

    def _propagate_one(idx_ic: tuple[int, dict]) -> dict:
        idx, ic = idx_ic
        traj = cr3bp.propagate(ic["state"], 2.0 * ic["period"], n_points=300)
        xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in traj]
        return {
            "trajectory":  xyz,
            "jacobi":      ic["jacobi"],
            "period_tu":   ic["period"],
            "period_days": ic.get("period_days", ic["period"] * 4.3425),
            "stability":   ic["stability"],
            "index":       idx,
        }

    futures  = [loop.run_in_executor(None, _propagate_one, s) for s in sampled]
    orbits   = await asyncio.gather(*futures)
    fam_meta = FAMILY_META.get(family_key, {"label": family_key, "color": "#AAAAAA"})
    return {
        "family_key": family_key,
        "label":      fam_meta["label"],
        "orbits":     list(orbits),
    }


# ── Internal helpers (run blocking scipy in thread pool) ──────────────────────

def _compute_family_sync(family_key: str, n: int) -> dict:
    ics = ic_cache.IC_CACHE.get(family_key)
    if not ics:
        raise KeyError(f"Family '{family_key}' not found in cache.")
    total   = len(ics)
    indices = [int(i * total / n) for i in range(n)] if total >= n else list(range(total))
    orbits  = []
    for idx in indices:
        ic   = ics[idx]
        traj = cr3bp.propagate(ic["state"], 2.0 * ic["period"], n_points=300)
        xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in traj]
        orbits.append({
            "trajectory":  xyz,
            "jacobi":      ic["jacobi"],
            "period_tu":   ic["period"],
            "period_days": ic.get("period_days", ic["period"] * 4.3425),
            "stability":   ic["stability"],
            "index":       idx,
        })
    fam_meta = FAMILY_META.get(family_key, {"label": family_key, "color": "#AAAAAA"})
    jacobis  = [ic["jacobi"] for ic in ics]
    return {
        "family_key": family_key,
        "label":      fam_meta["label"],
        "color":      fam_meta["color"],
        "jacobi_min": min(jacobis),
        "jacobi_max": max(jacobis),
        "orbits":     orbits,
    }


def _compute_orbit_sync(family: str, libr: int | None, branch: str | None, index: int, system: str = "earth-moon") -> dict:
    mu   = ic_cache.get_mu_for_system(system)
    ic   = ic_cache.get_ic(family, libr, branch, index)
    fam  = ic_cache.get_family(family, libr, branch)
    T2   = 2.0 * ic["period"]
    traj = cr3bp.propagate(ic["state"], T2, mu, n_points=500)
    xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in traj]
    return {
        "trajectory":    xyz,
        "period":        ic["period"],
        "jacobi":        ic["jacobi"],
        "total_members": len(fam),
        "metadata":      {"family": family, "libr": libr, "branch": branch},
    }


def _compute_manifold_sync(
    family: str, libr: int | None, branch: str | None,
    index: int, manifold_type: str,
    n_branches: int, propagation_time: float, system: str,
) -> dict:
    mu     = ic_cache.get_mu_for_system(system)
    ic     = ic_cache.get_ic(family, libr, branch, index)
    result: dict = {"type": manifold_type}
    tubes: list  = []

    if manifold_type in ("unstable", "both"):
        plus_u, minus_u = manifolds.compute_manifold(
            ic, mu=mu, stable=False,
            n_branches=n_branches, t_forward=propagation_time, t_backward=propagation_time,
        )
        result["unstable_plus"]  = plus_u
        result["unstable_minus"] = minus_u
        tubes.extend(plus_u + minus_u)

    if manifold_type in ("stable", "both"):
        plus_s, minus_s = manifolds.compute_manifold(
            ic, mu=mu, stable=True,
            n_branches=n_branches, t_forward=propagation_time, t_backward=propagation_time,
        )
        result["stable_plus"]  = plus_s
        result["stable_minus"] = minus_s
        tubes.extend(plus_s + minus_s)

    result["tubes"] = tubes
    return result


# ── /orbit ────────────────────────────────────────────────────────────────────

@app.post("/orbit")
async def orbit_endpoint(req: OrbitRequest):
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            _compute_orbit_sync,
            req.family, req.libr, req.branch, req.index, req.system,
        )
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Orbit computation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── /manifold ─────────────────────────────────────────────────────────────────

@app.post("/manifold")
async def manifold_endpoint(req: ManifoldRequest):
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            _compute_manifold_sync,
            req.family, req.libr, req.branch, req.index,
            req.type, req.n_branches, req.propagation_time, req.system,
        )
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Manifold computation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── /mission ──────────────────────────────────────────────────────────────────

@app.post("/mission")
async def mission_endpoint(req: MissionRequest):
    """Build a multi-leg mission trajectory from structured leg descriptors."""
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, mission_mod.build_mission, req.legs, req.system)
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Mission computation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── /transfer ─────────────────────────────────────────────────────────────────

@app.post("/transfer")
async def transfer_endpoint(req: TransferRequest):
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            mission_mod.compute_transfer,
            req.departure_family_key,
            req.departure_orbit_index,
            req.arrival_family_key,
            req.arrival_orbit_index,
        )
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Transfer computation failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ── /agent ────────────────────────────────────────────────────────────────────

@app.post("/agent")
async def agent_endpoint(req: AgentRequest):
    # 1. Get agent JSON response (async LLM call)
    available = list(ic_cache.cache_summary().keys())
    agent_response = await agent_mod.query_agent(req.message, available_families=available)
    commands = agent_response.get("commands", [])

    # 2. Enrich commands that require trajectory computation
    enriched_commands = []
    compute_tasks = []

    for cmd in commands:
        action = cmd.get("action", "")
        params = cmd.get("params", {})

        if action == "show_family":
            family_key = params.get("family_key", "")
            n          = max(1, min(100, int(params.get("n", 20))))
            logger.info("show_family: key=%r n=%d", family_key, n)
            compute_tasks.append(("family", cmd, family_key, n))

        elif action == "show_orbit":
            family = params.get("family", "lyapunov")
            libr   = params.get("libr")
            index  = params.get("index", 0)
            logger.info("show_orbit params received: family=%r libr=%r index=%r", family, libr, index)
            fam, lib, branch = _parse_agent_family(family, libr)
            logger.info("show_orbit resolved: fam=%r lib=%r branch=%r", fam, lib, branch)
            compute_tasks.append(("orbit", cmd, fam, lib, branch, index))

        elif action == "show_manifold":
            family     = params.get("family", "lyapunov")
            libr       = params.get("libr")
            index      = params.get("index", 0)
            mtype      = params.get("type", "unstable")
            n_branches = params.get("n_branches", 80)
            t_forward  = params.get("t_forward",  8.0)
            t_backward = params.get("t_backward", 10.0)
            fam, lib, branch = _parse_agent_family(family, libr)
            compute_tasks.append(("manifold", cmd, fam, lib, branch, index, mtype, n_branches, t_forward, t_backward))

        elif action == "design_mission":
            legs = params.get("legs", [])
            compute_tasks.append(("mission", cmd, legs))

        else:
            enriched_commands.append(cmd)

    # 3. Run all heavy computations concurrently in thread pool
    loop = asyncio.get_event_loop()
    futures = []
    task_meta = []

    for task in compute_tasks:
        kind = task[0]
        cmd  = task[1]

        if kind == "family":
            _, _, family_key, n = task
            fut = loop.run_in_executor(None, _compute_family_sync, family_key, n)
            futures.append(fut)
            task_meta.append(("family", cmd, None))

        elif kind == "orbit":
            _, _, fam, lib, branch, index = task
            fut = loop.run_in_executor(None, _compute_orbit_sync, fam, lib, branch, index)
            futures.append(fut)
            task_meta.append(("orbit", cmd, fam))

        elif kind == "manifold":
            _, _, fam, lib, branch, index, mtype, n_branches, t_forward, t_backward = task
            propagation_time = max(t_forward, t_backward)
            fut = loop.run_in_executor(
                None, _compute_manifold_sync,
                fam, lib, branch, index, mtype, n_branches, propagation_time, "earth-moon",
            )
            futures.append(fut)
            task_meta.append(("manifold", cmd, mtype))

        elif kind == "mission":
            _, _, legs = task
            fut = loop.run_in_executor(None, mission_mod.build_mission, legs)
            futures.append(fut)
            task_meta.append(("mission", cmd, None))

    results = await asyncio.gather(*futures, return_exceptions=True)

    for (kind, cmd, extra), result in zip(task_meta, results):
        if isinstance(result, Exception):
            logger.error("Computation failed for %s: %s", cmd.get("action"), result)
            enriched = dict(cmd)
            enriched["error"] = str(result)
            enriched_commands.append(enriched)
        elif kind == "family":
            enriched = dict(cmd)
            enriched["data"] = result   # family_key, label, color, jacobi_min/max, orbits
            enriched_commands.append(enriched)
        elif kind == "orbit":
            enriched = dict(cmd)
            enriched["data"] = result
            enriched["data"]["color"] = _orbit_color(extra)
            enriched_commands.append(enriched)
        elif kind == "manifold":
            enriched = dict(cmd)
            enriched["data"] = result   # contains unstable_plus/minus, stable_plus/minus
            enriched_commands.append(enriched)
        elif kind == "mission":
            enriched = dict(cmd)
            if isinstance(result, Exception):
                enriched["error"] = str(result)
                enriched["data"] = {
                    "error": str(result),
                    "legs": [],
                    "total_trajectory": [],
                    "total_duration": 0,
                }
            else:
                enriched["data"] = result
            enriched_commands.append(enriched)
        else:
            enriched = dict(cmd)
            enriched["data"] = result
            enriched_commands.append(enriched)

    return {
        "commands":     enriched_commands,
        "explanation":  agent_response.get("explanation", ""),
        "suggested_next": agent_response.get("suggested_next", ""),
    }
