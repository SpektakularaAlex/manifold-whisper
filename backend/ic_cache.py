"""
IC cache — loads periodic orbit initial conditions from local CSV files.

CSV files live in IC_Orbits/ (searched relative to this file's parent).
All values are non-dimensional CR3BP units.
"""

import csv
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── CSV filename → (family, libr, branch) ─────────────────────────────────────

_CSV_MAP: dict[str, tuple[str, int | None, str | None]] = {
    "L1_Halo_Northern.csv":   ("halo",      1,    "N"),
    "L1_Halo_Southern.csv":   ("halo",      1,    "S"),
    "L2_Halo_Northern.csv":   ("halo",      2,    "N"),
    "L2_Halo_Southern.csv":   ("halo",      2,    "S"),
    "L3_Halo_Northern.csv":   ("halo",      3,    "N"),
    "L3_Halo_Southern.csv":   ("halo",      3,    "S"),
    "L1_Lyapunov.csv":        ("lyapunov",  1,    None),
    "L2_Lyapunov.csv":        ("lyapunov",  2,    None),
    "L3_Lyapunov.csv":        ("lyapunov",  3,    None),
    "Butterfly_Northern.csv": ("butterfly", None, "N"),
    "Butterfly_Southern.csv": ("butterfly", None, "S"),
    "Dragonfly_Northern.csv": ("dragonfly", None, "N"),
    "Dragonfly_Southern.csv": ("dragonfly", None, "S"),
}

# Module-level in-memory store
IC_CACHE: dict[str, list[dict]] = {}


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


def load_all_families() -> None:
    """Load all CSV families into IC_CACHE. Called once at module import."""
    ic_dir = _find_ic_orbits_dir()
    if ic_dir is None:
        logger.error("IC_Orbits/ directory not found — orbit endpoints will fail.")
        return

    logger.info("Loading IC families from %s", ic_dir)
    for filename, (family, libr, branch) in _CSV_MAP.items():
        csv_path = ic_dir / filename
        if not csv_path.exists():
            logger.warning("  Missing CSV: %s", csv_path)
            continue
        key = _make_key(family, libr, branch)
        ics = _load_csv(csv_path, family, libr, branch)
        ics.sort(key=lambda ic: ic["jacobi"])
        IC_CACHE[key] = ics
        logger.info("  %-22s %4d orbits", key, len(ics))

    logger.info("IC cache ready: %d families, %d total orbits",
                len(IC_CACHE), sum(len(v) for v in IC_CACHE.values()))


# ── Lookup API ─────────────────────────────────────────────────────────────────

def get_family(family: str, libr: int | None, branch: str | None) -> list[dict]:
    key = _make_key(family, libr, branch)
    if key not in IC_CACHE:
        raise KeyError(
            f"Family '{key}' not found in cache. Available: {list(IC_CACHE.keys())}")
    return IC_CACHE[key]


def get_ic(
    family: str,
    libr:   int | None,
    branch: str | None,
    index:  int = 0,
) -> dict:
    ics = get_family(family, libr, branch)
    idx = max(0, min(index, len(ics) - 1))
    return ics[idx]


def find_by_jacobi(
    family: str,
    libr:   int | None,
    branch: str | None,
    target_jacobi: float,
) -> dict:
    ics = get_family(family, libr, branch)
    return min(ics, key=lambda ic: abs(ic["jacobi"] - target_jacobi))


def cache_summary() -> dict[str, int]:
    return {k: len(v) for k, v in IC_CACHE.items()}


# ── Load at import time ────────────────────────────────────────────────────────

load_all_families()
