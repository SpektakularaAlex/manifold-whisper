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
from fastapi import FastAPI, HTTPException
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Manifold backend...")
    logger.info("OPENAI_API_KEY present: %s", bool(os.getenv("OPENAI_API_KEY")))

    await ic_cache.fetch_all_families()

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

class ManifoldRequest(BaseModel):
    family:     str
    libr:       int | None = None
    branch:     str | None = None
    index:      int        = 0
    type:       str        = Field("unstable", pattern="^(stable|unstable|both)$")
    n_branches: int        = Field(80, ge=2, le=160)
    t_forward:  float      = Field(8.0, gt=0.0, le=15.0)
    t_backward: float      = Field(10.0, gt=0.0, le=15.0)

class MissionRequest(BaseModel):
    legs: list[dict]


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "families_loaded": ic_cache.cache_summary()}


# ── Internal helpers (run blocking scipy in thread pool) ──────────────────────

def _compute_orbit_sync(family: str, libr: int | None, branch: str | None, index: int) -> dict:
    ic  = ic_cache.get_ic(family, libr, branch, index)
    T2  = 2.0 * ic["period"]
    traj = cr3bp.propagate(ic["state"], T2, n_points=500)
    xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in traj]
    return {
        "trajectory": xyz,
        "period":     ic["period"],
        "jacobi":     ic["jacobi"],
        "metadata":   {"family": family, "libr": libr, "branch": branch},
    }


def _compute_manifold_sync(
    family: str, libr: int | None, branch: str | None,
    index: int, manifold_type: str,
    n_branches: int, t_forward: float, t_backward: float,
) -> dict:
    ic = ic_cache.get_ic(family, libr, branch, index)
    result: dict = {"type": manifold_type}

    if manifold_type in ("unstable", "both"):
        plus_u, minus_u = manifolds.compute_manifold(
            ic, mu=cr3bp.MU, stable=False,
            n_branches=n_branches, t_forward=t_forward, t_backward=t_backward,
        )
        result["unstable_plus"]  = plus_u
        result["unstable_minus"] = minus_u

    if manifold_type in ("stable", "both"):
        plus_s, minus_s = manifolds.compute_manifold(
            ic, mu=cr3bp.MU, stable=True,
            n_branches=n_branches, t_forward=t_forward, t_backward=t_backward,
        )
        result["stable_plus"]  = plus_s
        result["stable_minus"] = minus_s

    return result


# ── /orbit ────────────────────────────────────────────────────────────────────

@app.post("/orbit")
async def orbit_endpoint(req: OrbitRequest):
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            _compute_orbit_sync,
            req.family, req.libr, req.branch, req.index,
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
            req.type, req.n_branches, req.t_forward, req.t_backward,
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
        result = await loop.run_in_executor(None, mission_mod.build_mission, req.legs)
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Mission computation failed")
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

        if action == "show_orbit":
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

        if kind == "orbit":
            _, _, fam, lib, branch, index = task
            fut = loop.run_in_executor(None, _compute_orbit_sync, fam, lib, branch, index)
            futures.append(fut)
            task_meta.append(("orbit", cmd, fam))

        elif kind == "manifold":
            _, _, fam, lib, branch, index, mtype, n_branches, t_forward, t_backward = task
            fut = loop.run_in_executor(
                None, _compute_manifold_sync,
                fam, lib, branch, index, mtype, n_branches, t_forward, t_backward,
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
