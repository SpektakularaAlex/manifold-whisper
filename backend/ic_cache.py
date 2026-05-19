"""
IC cache — loads periodic orbit initial conditions from local CSV files.

CSV files live in IC_Orbits/ (searched relative to this file's parent).
All values are non-dimensional CR3BP units.
"""

import csv
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MU_BY_SYSTEM: dict[str, float] = {
    "earth-moon":       0.01215058560962404,
    "sun-earth":        3.003480e-6,
    "jupiter-europa":   2.528017e-5,
    "saturn-enceladus": 1.901e-7,
    "saturn-titan":     2.366e-4,
    "mars-phobos":      1.667e-8,
}

def get_mu_for_system(system_id: str) -> float:
    return MU_BY_SYSTEM.get(system_id, 0.01215058560962404)

_SYSTEM_FOLDER: dict[str, str] = {
    "earth-moon":       "Earth-Moon",
    "sun-earth":        "Sun-Earth",
    "jupiter-europa":   "Jupiter-Europa",
    "saturn-enceladus": "Saturn-Enceladus",
    "saturn-titan":     "Saturn-Titan",
    "mars-phobos":      "Mars-Phobos",
}

# ── CSV filename → (family, libr, branch) ─────────────────────────────────────

_CSV_MAP: dict[str, tuple[str, int | None, str | None]] = {
    "L1_Halo_Northern.csv":   ("halo",             1,    "N"),
    "L1_Halo_Southern.csv":   ("halo",             1,    "S"),
    "L2_Halo_Northern.csv":   ("halo",             2,    "N"),
    "L2_Halo_Southern.csv":   ("halo",             2,    "S"),
    "L3_Halo_Northern.csv":   ("halo",             3,    "N"),
    "L3_Halo_Southern.csv":   ("halo",             3,    "S"),
    "L1_Lyapunov.csv":        ("lyapunov",         1,    None),
    "L2_Lyapunov.csv":        ("lyapunov",         2,    None),
    "L3_Lyapunov.csv":        ("lyapunov",         3,    None),
    "Butterfly_Northern.csv": ("butterfly",        None, "N"),
    "Butterfly_Southern.csv": ("butterfly",        None, "S"),
    "Dragonfly_Northern.csv": ("dragonfly",        None, "N"),
    "Dragonfly_Southern.csv": ("dragonfly",        None, "S"),
    "L1_Axial.csv":           ("axial",            1,    None),
    "L1_Vertical.csv":        ("vertical",         1,    None),
    "L2_Axial.csv":           ("axial",            2,    None),
    "L2_Vertical.csv":        ("vertical",         2,    None),
    "L3_Axial.csv":           ("axial",            3,    None),
    "L3_Vertical.csv":        ("vertical",         3,    None),
    "L4_Axial.csv":           ("axial",            4,    None),
    "L4_Long_Period.csv":     ("long_period",      4,    None),
    "L4_Short_Period.csv":    ("short_period",     4,    None),
    "L4_Vertical.csv":        ("vertical",         4,    None),
    "L5_Axial.csv":           ("axial",            5,    None),
    "L5_Long_Period.csv":     ("long_period",      5,    None),
    "L5_Short_Period.csv":    ("short_period",     5,    None),
    "L5_Vertical.csv":        ("vertical",         5,    None),
    "Distant_Prograde.csv":   ("distant_prograde", None, None),
    "Distant_Retrograde.csv": ("distant_retrograde", None, None),
    "Low_Prograde_East.csv":  ("low_prograde",     None, "E"),
    "Low_Prograde_West.csv":  ("low_prograde",     None, "W"),
}

# Module-level in-memory store: IC_CACHE[system_id][family_key] = [ic, ...]
IC_CACHE: dict[str, dict[str, list[dict]]] = {}


# ── Key helpers ────────────────────────────────────────────────────────────────

def _make_key(family: str, libr: int | None, branch: str | None) -> str:
    parts = [family]
    if libr is not None:
        parts.append(f"L{libr}")
    if branch is not None:
        parts.append(branch)
    return "_".join(parts)


def _find_ic_orbits_dir() -> Path | None:
    candidates = [
        Path(__file__).parent / "../IC_Orbits",
        Path("IC_Orbits"),
        Path("../../IC_Orbits"),
    ]
    for p in candidates:
        resolved = p.resolve()
        if resolved.is_dir():
            return resolved
    return None


# ── CSV loading ────────────────────────────────────────────────────────────────

def _load_csv(csv_path: Path, family: str, libr: int | None, branch: str | None) -> list[dict]:
    ics: list[dict] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        # Strip whitespace from field names
        reader.fieldnames = [name.strip() for name in (reader.fieldnames or [])]
        for row in reader:
            # Strip whitespace from all values
            clean = {k.strip(): v.strip() for k, v in row.items()}
            try:
                ic = {
                    "state": [
                        float(clean["x0 (LU)"]),
                        float(clean["y0 (LU)"]),
                        float(clean["z0 (LU)"]),
                        float(clean["vx0 (LU/TU)"]),
                        float(clean["vy0 (LU/TU)"]),
                        float(clean["vz0 (LU/TU)"]),
                    ],
                    "period":      float(clean["Period (TU)"]),
                    "period_days": float(clean["Period (days)"]),
                    "jacobi":      float(clean["Jacobi constant (LU2/TU2)"]),
                    "stability":   float(clean["Stability index"]),
                    "family":      family,
                    "libr":        libr,
                    "branch":      branch,
                }
            except (KeyError, ValueError) as exc:
                logger.warning("Skipping malformed row in %s: %s", csv_path.name, exc)
                continue
            ics.append(ic)
    return ics


def load_all_families(system_id: str = "Earth-Moon") -> None:
    """Load all CSV families for a system into IC_CACHE."""
    ic_dir = _find_ic_orbits_dir()
    if ic_dir is None:
        logger.warning("IC_Orbits directory not found")
        return

    key_id = system_id.lower()
    folder = _SYSTEM_FOLDER.get(key_id, system_id)
    system_dir = ic_dir / folder
    if not system_dir.exists():
        logger.warning("No IC subfolder found for system: %s", system_id)
        logger.warning("Expected: %s", system_dir)
        return

    logger.info("Loading ICs for %s from %s", system_id, system_dir)
    IC_CACHE.setdefault(key_id, {})

    for filename, (family, libr, branch) in _CSV_MAP.items():
        csv_path = system_dir / filename
        if not csv_path.exists():
            logger.warning("  Missing CSV: %s", csv_path)
            continue
        key = _make_key(family, libr, branch)
        ics = _load_csv(csv_path, family, libr, branch)
        ics.sort(key=lambda ic: ic["jacobi"])
        IC_CACHE[key_id][key] = ics
        logger.info("  %-22s %4d orbits", key, len(ics))

    loaded = sum(len(v) for v in IC_CACHE[key_id].values())
    logger.info("IC cache ready for %s: %d families, %d total orbits",
                system_id, len(IC_CACHE[key_id]), loaded)


# ── Lookup API ─────────────────────────────────────────────────────────────────

def get_family(family: str, libr: int | None, branch: str | None, system_id: str = "earth-moon") -> list[dict]:
    key = _make_key(family, libr, branch)
    system_cache = IC_CACHE.get(system_id.lower(), {})
    if key not in system_cache:
        raise KeyError(
            f"Family '{key}' not found for system '{system_id}'. Available: {list(system_cache.keys())}")
    return system_cache[key]


def get_ic(
    family:    str,
    libr:      int | None,
    branch:    str | None,
    index:     int = 0,
    system_id: str = "earth-moon",
) -> dict:
    ics = get_family(family, libr, branch, system_id)
    idx = max(0, min(index, len(ics) - 1))
    return ics[idx]


def find_by_jacobi(
    family:        str,
    libr:          int | None,
    branch:        str | None,
    target_jacobi: float,
    system_id:     str = "earth-moon",
) -> dict:
    ics = get_family(family, libr, branch, system_id)
    return min(ics, key=lambda ic: abs(ic["jacobi"] - target_jacobi))


def cache_summary() -> dict[str, int]:
    result = {}
    for sys_id, families in IC_CACHE.items():
        for key, ics in families.items():
            result[f"{sys_id}:{key}"] = len(ics)
    return result


# ── On-demand system loading ───────────────────────────────────────────────────

def _load_system_from_json(system_id: str, system_dir: Path) -> None:
    """Load all JSON files in system_dir into IC_CACHE[system_id]."""
    IC_CACHE[system_id] = {}
    loaded = 0
    for json_file in sorted(system_dir.glob("*.json")):
        try:
            with open(json_file) as f:
                records = json.load(f)
            if not records:
                continue
            key = json_file.stem
            IC_CACHE[system_id][key] = records
            loaded += len(records)
            logger.info("  %s/%s: %d ICs", system_id, key, len(records))
        except Exception as e:
            logger.warning("Failed to load %s: %s", json_file, e)
    logger.info("Loaded %d total ICs for %s", loaded, system_id)


def ensure_system_loaded(system_id: str) -> bool:
    """
    Load a system's ICs if not already in cache.
    Returns True if system is available, False if not.
    """
    key_id = system_id.lower()
    if key_id in IC_CACHE and len(IC_CACHE[key_id]) > 0:
        return True

    ic_dir = _find_ic_orbits_dir()
    if ic_dir is None:
        return False

    folder = _SYSTEM_FOLDER.get(key_id, system_id)
    system_dir = ic_dir / folder
    if not system_dir.exists():
        logger.warning("No IC data found for system: %s", system_id)
        return False

    json_files = list(system_dir.glob("*.json"))
    if json_files:
        _load_system_from_json(key_id, system_dir)
        return key_id in IC_CACHE and len(IC_CACHE[key_id]) > 0

    load_all_families(system_id)
    return key_id in IC_CACHE and len(IC_CACHE[key_id]) > 0


# ── Load at import time ────────────────────────────────────────────────────────

load_all_families("Earth-Moon")
