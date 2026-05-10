"""
Mission trajectory builder — composes multi-leg cislunar missions.

Each leg descriptor from the agent is mapped to a computed trajectory segment.
All coordinates non-dimensional CR3BP units.
"""

import logging

import numpy as np

from cr3bp import MU, propagate
from ic_cache import get_ic
from manifolds import compute_manifold

logger = logging.getLogger(__name__)


# ── Family helpers (mirrors _parse_agent_family in main.py) ──────────────────

def _parse_family(agent_family: str, libr) -> tuple[str, object, object]:
    """Convert agent family string → (family, libr, branch) for ic_cache."""
    if agent_family == "halo_N":
        return "halo", libr, "N"
    if agent_family == "halo_S":
        return "halo", libr, "S"
    if agent_family == "butterfly_N":
        return "butterfly", None, "N"
    return agent_family, libr, None


def _family_color(agent_family: str) -> str:
    return {
        "lyapunov":   "#00FFFF",
        "halo_N":     "#FFFFFF",
        "halo_S":     "#FFFFFF",
        "halo":       "#FFFFFF",
        "dro":        "#FFD700",
        "butterfly_N":"#BB86FC",
        "butterfly":  "#BB86FC",
    }.get(agent_family, "#FFFFFF")


# ── Mission builder ───────────────────────────────────────────────────────────

def build_mission(legs: list[dict], mu: float = MU) -> dict:
    """
    Build a complete mission trajectory from a list of leg descriptors.

    Returns:
        {
          "legs": [{label, type, trajectory, color, duration}, ...],
          "total_trajectory": [[x,y,z], ...],
          "total_duration": float
        }
    """
    built: list[dict] = []

    for leg in legs:
        leg_type = leg.get("type", "")
        logger.info("Building mission leg: %s", leg_type)

        try:
            if leg_type == "orbit":
                _build_orbit_leg(leg, mu, built)

            elif leg_type == "manifold_departure":
                _build_manifold_leg(leg, mu, built, arrival=False)

            elif leg_type == "manifold_arrival":
                _build_manifold_leg(leg, mu, built, arrival=True)

            elif leg_type == "free_flight":
                _build_free_flight_leg(leg, mu, built)

            else:
                logger.warning("Unknown leg type: %s", leg_type)

        except Exception as exc:
            logger.error("Leg '%s' failed: %s", leg_type, exc)
            # Skip bad legs rather than aborting the whole mission

    total_traj: list[list[float]] = []
    total_duration = 0.0
    for b in built:
        total_traj.extend(b["trajectory"])
        total_duration += b["duration"]

    return {
        "legs":             built,
        "total_trajectory": total_traj,
        "total_duration":   total_duration,
    }


def _build_orbit_leg(leg: dict, mu: float, out: list) -> None:
    fam, lib, branch = _parse_family(leg["family"], leg.get("libr"))
    ic = get_ic(fam, lib, branch, leg.get("index", 0))
    traj = propagate(ic["state"], ic["period"] * 2, mu, n_points=300)
    xyz = traj[:, :3].tolist()
    out.append({
        "label":      leg.get("label", "Orbit"),
        "type":       "orbit",
        "trajectory": xyz,
        "color":      _family_color(leg["family"]),
        "duration":   ic["period"] * 2,
    })


def _build_manifold_leg(leg: dict, mu: float, out: list, arrival: bool) -> None:
    fam, lib, branch = _parse_family(leg["family"], leg.get("libr"))
    ic = get_ic(fam, lib, branch, leg.get("index", 0))

    mtype       = leg.get("manifold_type", "stable" if arrival else "unstable")
    is_stable   = (mtype == "stable")
    branch_idx  = leg.get("branch_index", 0)
    prop_time   = 3.5

    tubes = compute_manifold(
        ic, mu=mu, stable=is_stable,
        n_branches=20, propagation_time=prop_time,
    )
    if not tubes:
        logger.warning("No tubes returned for %s leg", leg.get("type"))
        return

    idx  = min(branch_idx, len(tubes) - 1)
    traj = tubes[idx]

    if arrival:
        traj = list(reversed(traj))   # approach → orbit

    color = "#4FC3F7" if is_stable else "#FF6B35"
    out.append({
        "label":      leg.get("label", "Manifold arrival" if arrival else "Manifold departure"),
        "type":       leg["type"],
        "trajectory": traj,
        "color":      color,
        "duration":   prop_time,
    })


def _build_free_flight_leg(leg: dict, mu: float, out: list) -> None:
    from_state = leg.get("from_state")
    if from_state is None:
        if out and out[-1]["trajectory"]:
            last = out[-1]["trajectory"][-1]
            from_state = last + [0.0, 0.0, 0.0]   # zero velocity fallback
        else:
            logger.warning("free_flight leg has no from_state and no prior leg")
            return

    duration = float(leg.get("duration", 1.5))
    traj     = propagate(from_state, duration, mu, n_points=200)
    xyz      = traj[:, :3].tolist()
    out.append({
        "label":      leg.get("label", "Free flight"),
        "type":       "free_flight",
        "trajectory": xyz,
        "color":      "#B39DDB",
        "duration":   duration,
    })
