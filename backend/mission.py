"""
Mission trajectory builder — composes multi-leg cislunar missions and
computes manifold-guided transfers between two periodic orbits.
"""

import logging

import numpy as np

from cr3bp import MU, propagate
from ic_cache import get_ic, IC_CACHE, get_mu_for_system
from manifolds import compute_manifold

logger = logging.getLogger(__name__)

TU_TO_DAYS = 4.3425  # 1 non-dim TU ≈ 4.3425 days

FAMILY_COLORS = {
    "halo_L1_N":          "#FFFFFF", "halo_L1_S":          "#DDDDDD",
    "halo_L2_N":          "#AADDFF", "halo_L2_S":          "#88BBFF",
    "halo_L3_N":          "#FFAADD", "halo_L3_S":          "#FF88BB",
    "lyapunov_L1":        "#00FFFF", "lyapunov_L2":        "#00DDDD", "lyapunov_L3": "#00BBBB",
    "butterfly_N":        "#FF6B35", "butterfly_S":        "#FF8C5A",
    "dragonfly_N":        "#FFD700", "dragonfly_S":        "#FFC200",
    "axial_L1":           "#CC88FF", "axial_L2":           "#BB77EE", "axial_L3":    "#AA66DD",
    "axial_L4":           "#9955CC", "axial_L5":           "#8844BB",
    "vertical_L1":        "#44FF88", "vertical_L2":        "#33EE77", "vertical_L3": "#22DD66",
    "vertical_L4":        "#11CC55", "vertical_L5":        "#00BB44",
    "long_period_L4":     "#FF9933", "long_period_L5":     "#FF7722",
    "short_period_L4":    "#FFCC33", "short_period_L5":    "#FFBB22",
    "distant_prograde":   "#00FFEE", "distant_retrograde": "#FF44AA",
    "low_prograde_E":     "#AAFF44", "low_prograde_W":     "#88EE33",
}

FAMILY_LABELS = {
    "halo_L1_N":          "L1 North Halo",       "halo_L1_S":          "L1 South Halo",
    "halo_L2_N":          "L2 North Halo",       "halo_L2_S":          "L2 South Halo",
    "halo_L3_N":          "L3 North Halo",       "halo_L3_S":          "L3 South Halo",
    "lyapunov_L1":        "L1 Lyapunov",         "lyapunov_L2":        "L2 Lyapunov",
    "lyapunov_L3":        "L3 Lyapunov",
    "butterfly_N":        "Butterfly North",     "butterfly_S":        "Butterfly South",
    "dragonfly_N":        "Dragonfly North",     "dragonfly_S":        "Dragonfly South",
    "axial_L1":           "L1 Axial",            "axial_L2":           "L2 Axial",
    "axial_L3":           "L3 Axial",            "axial_L4":           "L4 Axial",
    "axial_L5":           "L5 Axial",
    "vertical_L1":        "L1 Vertical",         "vertical_L2":        "L2 Vertical",
    "vertical_L3":        "L3 Vertical",         "vertical_L4":        "L4 Vertical",
    "vertical_L5":        "L5 Vertical",
    "long_period_L4":     "L4 Long Period",      "long_period_L5":     "L5 Long Period",
    "short_period_L4":    "L4 Short Period",     "short_period_L5":    "L5 Short Period",
    "distant_prograde":   "Distant Prograde",    "distant_retrograde": "Distant Retrograde",
    "low_prograde_E":     "Low Prograde (East)", "low_prograde_W":     "Low Prograde (West)",
}


# ── Family helpers (mirrors _parse_agent_family in main.py) ──────────────────

def _parse_family(agent_family: str, libr) -> tuple[str, object, object]:
    if agent_family == "halo_N":
        return "halo", libr, "N"
    if agent_family == "halo_S":
        return "halo", libr, "S"
    if agent_family == "butterfly_N":
        return "butterfly", None, "N"
    return agent_family, libr, None


def _family_color(agent_family: str) -> str:
    return {
        "lyapunov":    "#00FFFF",
        "halo_N":      "#FFFFFF",
        "halo_S":      "#FFFFFF",
        "halo":        "#FFFFFF",
        "dro":         "#FFD700",
        "butterfly_N": "#BB86FC",
        "butterfly":   "#BB86FC",
    }.get(agent_family, "#FFFFFF")


# ── Agent-driven mission builder ─────────────────────────────────────────────

def build_mission(legs: list[dict], system: str = "earth-moon", mu: float = MU) -> dict:
    mu = get_mu_for_system(system)
    built: list[dict] = []
    for leg in legs:
        leg_type = leg.get("type", "")
        logger.info("Building mission leg: %s", leg_type)
        try:
            if leg_type == "orbit":
                _build_orbit_leg(leg, mu, built)
            elif leg_type in ("manifold_departure", "manifold_arrival"):
                _build_manifold_leg(leg, mu, built, arrival=(leg_type == "manifold_arrival"))
            elif leg_type == "free_flight":
                _build_free_flight_leg(leg, mu, built)
            else:
                logger.warning("Unknown leg type: %s", leg_type)
        except Exception as exc:
            logger.error("Leg '%s' failed: %s", leg_type, exc)

    total_traj: list[list[float]] = []
    total_duration = 0.0
    for b in built:
        logger.info("Leg %s: %d points, color %s", b["type"], len(b["trajectory"]), b["color"])
        total_traj.extend(b["trajectory"])
        total_duration += b["duration"]

    logger.info("Mission total: %d legs, %d total points", len(built), len(total_traj))
    return {
        "legs":             built,
        "total_trajectory": total_traj,
        "total_duration":   total_duration,
    }


def _build_orbit_leg(leg: dict, mu: float, out: list) -> None:
    fam, lib, branch = _parse_family(leg["family"], leg.get("libr"))
    ic   = get_ic(fam, lib, branch, leg.get("index", 0))
    traj = propagate(ic["state"], ic["period"] * 2, mu, n_points=300)
    out.append({
        "label":      leg.get("label", "Orbit"),
        "type":       "orbit",
        "trajectory": traj[:, :3].tolist(),
        "color":      _family_color(leg["family"]),
        "duration":   ic["period"] * 2,
    })


def _build_manifold_leg(leg: dict, mu: float, out: list, arrival: bool) -> None:
    fam, lib, branch = _parse_family(leg["family"], leg.get("libr"))
    ic       = get_ic(fam, lib, branch, leg.get("index", 0))
    is_stable = (leg.get("manifold_type", "stable" if arrival else "unstable") == "stable")
    branch_idx = leg.get("branch_index", 0)

    plus_tubes, minus_tubes = compute_manifold(
        ic, mu=mu, stable=is_stable, n_branches=20,
        t_forward=3.5, t_backward=3.5,
    )
    all_tubes = plus_tubes + minus_tubes
    if not all_tubes:
        logger.warning("No tubes returned for %s leg", leg.get("type"))
        return

    traj = all_tubes[min(branch_idx, len(all_tubes) - 1)]
    if arrival:
        traj = list(reversed(traj))

    prop_time = max(8.0, 2.5 * ic["period"]) if not is_stable else max(10.0, 3.0 * ic["period"])
    out.append({
        "label":      leg.get("label", "Manifold arrival" if arrival else "Manifold departure"),
        "type":       leg["type"],
        "trajectory": traj,
        "color":      "#4FC3F7" if is_stable else "#FF6B35",
        "duration":   prop_time,
    })


def _build_free_flight_leg(leg: dict, mu: float, out: list) -> None:
    from_state = leg.get("from_state")
    if from_state is None:
        if out and out[-1]["trajectory"]:
            last = out[-1]["trajectory"][-1]
            from_state = last + [0.0, 0.0, 0.0]
        else:
            logger.warning("free_flight leg has no from_state and no prior leg")
            return
    duration = float(leg.get("duration", 1.5))
    traj = propagate(from_state, duration, mu, n_points=200)
    out.append({
        "label":      leg.get("label", "Free flight"),
        "type":       "free_flight",
        "trajectory": traj[:, :3].tolist(),
        "color":      "#B39DDB",
        "duration":   duration,
    })


# ── Manifold-guided transfer planner ─────────────────────────────────────────

def compute_transfer(
    dep_family_key: str,
    dep_orbit_index: int,
    arr_family_key: str,
    arr_orbit_index: int,
    mu: float = MU,
) -> dict:
    """
    Compute a manifold-guided transfer between two periodic orbits.

    Method:
      1. Propagate unstable manifold of departure orbit
      2. Propagate stable manifold of arrival orbit
      3. Find closest-approach pair of tube endpoints
      4. Connect with a straight free-flight arc
      5. Return color-coded segments + full concatenated trajectory
    """
    dep_ics = IC_CACHE.get(dep_family_key)
    arr_ics = IC_CACHE.get(arr_family_key)
    if not dep_ics:
        raise KeyError(f"Departure family '{dep_family_key}' not found")
    if not arr_ics:
        raise KeyError(f"Arrival family '{arr_family_key}' not found")

    dep_ic = dep_ics[max(0, min(dep_orbit_index, len(dep_ics) - 1))]
    arr_ic = arr_ics[max(0, min(arr_orbit_index, len(arr_ics) - 1))]
    dep_T  = dep_ic["period"]
    arr_T  = arr_ic["period"]

    # Use shorter propagation for the transfer (speed + keeps tubes in cislunar region)
    t_dep = max(6.0, 2.0 * dep_T)
    t_arr = max(6.0, 2.0 * arr_T)

    logger.info("Computing transfer: %s[%d] T=%.3f → %s[%d] T=%.3f",
                dep_family_key, dep_orbit_index, dep_T,
                arr_family_key, arr_orbit_index, arr_T)

    dep_plus, dep_minus = compute_manifold(
        dep_ic, mu=mu, stable=False,
        n_branches=40, t_forward=t_dep,
    )
    arr_plus, arr_minus = compute_manifold(
        arr_ic, mu=mu, stable=True,
        n_branches=40, t_backward=t_arr,
    )

    all_dep = dep_plus + dep_minus
    all_arr = arr_plus + arr_minus

    # Collect tube endpoints (farthest from orbit — last point of each tube)
    dep_ends = [(np.array(tube[-1][:3], dtype=float), tube)
                for tube in all_dep if len(tube) >= 2]
    arr_ends = [(np.array(tube[-1][:3], dtype=float), tube)
                for tube in all_arr if len(tube) >= 2]

    if not dep_ends or not arr_ends:
        raise RuntimeError(
            "Manifold computation produced no tubes — try a different orbit index")

    # Find minimum-distance pair of endpoints
    best_dist     = np.inf
    best_dep_tube = dep_ends[0][1]
    best_arr_tube = arr_ends[0][1]
    best_dep_end  = dep_ends[0][0]
    best_arr_end  = arr_ends[0][0]

    for dep_pt, dep_tube in dep_ends:
        for arr_pt, arr_tube in arr_ends:
            d = float(np.linalg.norm(dep_pt - arr_pt))
            if d < best_dist:
                best_dist     = d
                best_dep_tube = dep_tube
                best_arr_tube = arr_tube
                best_dep_end  = dep_pt
                best_arr_end  = arr_pt

    logger.info("Closest approach: %.4f LU  (%d × %d endpoint pairs searched)",
                best_dist, len(dep_ends), len(arr_ends))

    # Transfer arc: linear interpolation between the two manifold endpoints
    n_arc = 40
    ts    = np.linspace(0.0, 1.0, n_arc)
    arc   = [(best_dep_end + t * (best_arr_end - best_dep_end)).tolist() for t in ts]
    arc_duration = max(0.1, best_dist * 2.0)   # rough TU estimate

    # Build trajectory arrays
    dep_orbit_xyz = propagate(dep_ic["state"], dep_T * 2, mu, n_points=300)[:, :3].tolist()
    arr_orbit_xyz = propagate(arr_ic["state"], arr_T * 2, mu, n_points=300)[:, :3].tolist()
    dep_mfld_xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in best_dep_tube]
    arr_mfld_xyz  = [[float(p[0]), float(p[1]), float(p[2])] for p in reversed(best_arr_tube)]

    dep_color = FAMILY_COLORS.get(dep_family_key, "#AADDFF")
    arr_color = FAMILY_COLORS.get(arr_family_key, "#FFAADD")
    dep_label = FAMILY_LABELS.get(dep_family_key, dep_family_key)
    arr_label = FAMILY_LABELS.get(arr_family_key, arr_family_key)

    segments = [
        {
            "label":        f"Departure: {dep_label}",
            "trajectory":   dep_orbit_xyz,
            "color":        dep_color,
            "duration_tu":  dep_T * 2,
            "duration_days": dep_T * 2 * TU_TO_DAYS,
        },
        {
            "label":        "Unstable manifold",
            "trajectory":   dep_mfld_xyz,
            "color":        "#FF2200",
            "duration_tu":  t_dep,
            "duration_days": t_dep * TU_TO_DAYS,
        },
        {
            "label":        "Transfer arc",
            "trajectory":   arc,
            "color":        "#FFFF00",
            "duration_tu":  arc_duration,
            "duration_days": arc_duration * TU_TO_DAYS,
        },
        {
            "label":        "Stable manifold",
            "trajectory":   arr_mfld_xyz,
            "color":        "#0066FF",
            "duration_tu":  t_arr,
            "duration_days": t_arr * TU_TO_DAYS,
        },
        {
            "label":        f"Arrival: {arr_label}",
            "trajectory":   arr_orbit_xyz,
            "color":        arr_color,
            "duration_tu":  arr_T * 2,
            "duration_days": arr_T * 2 * TU_TO_DAYS,
        },
    ]

    total_traj  = []
    for seg in segments:
        total_traj.extend(seg["trajectory"])
    total_tu    = sum(s["duration_tu"] for s in segments)

    return {
        "segments":            segments,
        "total_trajectory":    total_traj,
        "total_duration_tu":   total_tu,
        "total_duration_days": total_tu * TU_TO_DAYS,
        "closest_approach_lu": best_dist,
    }
