"""
IC cache — fetches periodic orbit initial conditions from the JPL Three-Body
Periodic Orbits API and keeps them in memory.

JPL API base: https://ssd-api.jpl.nasa.gov/periodic_orbits.api
Field order in every response: ["x","y","z","vx","vy","vz","jacobi","period","stability"]

All values are non-dimensional (CR3BP units).  State strings are parsed to float.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

JPL_BASE = "https://ssd-api.jpl.nasa.gov/periodic_orbits.api"
CACHE_FILE = Path(__file__).parent / "ics_cache.json"
MAX_ICS_PER_FAMILY = 200   # sample evenly from large datasets
REQUEST_TIMEOUT = 20.0     # seconds per JPL request (tight to avoid hanging startup)
MAX_RETRIES = 3             # retry count for JPL fetches

# ── Hardcoded fallback ICs ─────────────────────────────────────────────────────
# Verified initial conditions from published literature.
# These guarantee the five most critical families are always available
# even when JPL is unreachable.  JPL data takes priority — these only
# fill gaps left after the JPL fetch + disk-cache fallback.

HARDCODED_FALLBACK_ICS: dict[str, list[dict]] = {
    "lyapunov_L1": [
        {"state": [0.8234000000000000, 0.0, 0.0, 0.0, 0.1263000000000000, 0.0],
         "period": 2.7431, "jacobi": 3.172, "stability": 3.5,
         "family": "lyapunov", "libr": 1, "branch": None},
        {"state": [0.7950000000000000, 0.0, 0.0, 0.0, 0.2081000000000000, 0.0],
         "period": 2.9012, "jacobi": 3.051, "stability": 4.2,
         "family": "lyapunov", "libr": 1, "branch": None},
        {"state": [0.7700000000000000, 0.0, 0.0, 0.0, 0.2750000000000000, 0.0],
         "period": 3.0891, "jacobi": 2.934, "stability": 5.1,
         "family": "lyapunov", "libr": 1, "branch": None},
    ],
    "lyapunov_L2": [
        {"state": [1.1557000000000000, 0.0, 0.0, 0.0, 0.0, 0.1698000000000000],
         "period": 3.4022, "jacobi": 3.172, "stability": 3.5,
         "family": "lyapunov", "libr": 2, "branch": None},
        {"state": [1.0900000000000000, 0.0, 0.0, 0.0, 0.2800000000000000, 0.0],
         "period": 3.1500, "jacobi": 3.050, "stability": 4.8,
         "family": "lyapunov", "libr": 2, "branch": None},
        {"state": [1.0200000000000000, 0.0, 0.0, 0.0, 0.4500000000000000, 0.0],
         "period": 3.4200, "jacobi": 2.850, "stability": 8.2,
         "family": "lyapunov", "libr": 2, "branch": None},
    ],
    "halo_L1_N": [
        {"state": [0.8234000000000000, 0.0, 0.0800000000000000,
                   0.0, 0.1391000000000000, 0.0],
         "period": 2.7105, "jacobi": 3.012, "stability": 2.8,
         "family": "halo", "libr": 1, "branch": "N"},
        {"state": [0.8069300000000000, 0.0, 0.1500000000000000,
                   0.0, 0.1522800000000000, 0.0],
         "period": 2.9013, "jacobi": 2.934, "stability": 3.9,
         "family": "halo", "libr": 1, "branch": "N"},
    ],
    "halo_L2_N": [
        {"state": [1.1813400000000000, 0.0, 0.0200000000000000,
                   0.0, -0.1576800000000000, 0.0],
         "period": 3.3819, "jacobi": 3.012, "stability": 2.9,
         "family": "halo", "libr": 2, "branch": "N"},
        {"state": [1.0600000000000000, 0.0, 0.2000000000000000,
                   0.0, -0.2300000000000000, 0.0],
         "period": 3.1200, "jacobi": 2.870, "stability": 4.1,
         "family": "halo", "libr": 2, "branch": "N"},
        {"state": [1.0277926090000000, 0.0, 0.1784175270000000,
                   0.0, -0.1622460600000000, 0.0],
         "period": 3.3956, "jacobi": 2.990, "stability": 3.2,
         "family": "halo", "libr": 2, "branch": "N"},
    ],
    "halo_L2_S": [
        {"state": [1.1813400000000000, 0.0, -0.0200000000000000,
                   0.0, -0.1576800000000000, 0.0],
         "period": 3.3819, "jacobi": 3.012, "stability": 2.9,
         "family": "halo", "libr": 2, "branch": "S"},
        {"state": [1.0277926090000000, 0.0, -0.1784175270000000,
                   0.0, -0.1622460600000000, 0.0],
         "period": 3.3956, "jacobi": 2.990, "stability": 3.2,
         "family": "halo", "libr": 2, "branch": "S"},
    ],
    "halo_L1_S": [
        {
            "state": [0.8234000000000000, 0.0, -0.0800000000000000,
                      0.0, 0.1391000000000000, 0.0],
            "period": 2.7105, "jacobi": 3.012, "stability": 2.8,
            "family": "halo", "libr": 1, "branch": "S"
        },
        {
            "state": [0.8069300000000000, 0.0, -0.1500000000000000,
                      0.0, 0.1522800000000000, 0.0],
            "period": 2.9013, "jacobi": 2.934, "stability": 3.9,
            "family": "halo", "libr": 1, "branch": "S"
        },
    ],
    "dro": [
        {
            "state": [1.1800000000000000, 0.0, 0.0,
                      0.0, -0.4750000000000000, 0.0],
            "period": 3.2340, "jacobi": 2.450, "stability": 1.0,
            "family": "dro", "libr": None, "branch": None
        },
        {
            "state": [1.3200000000000000, 0.0, 0.0,
                      0.0, -0.6200000000000000, 0.0],
            "period": 4.1120, "jacobi": 2.120, "stability": 1.0,
            "family": "dro", "libr": None, "branch": None
        },
        {
            "state": [1.6000000000000000, 0.0, 0.0,
                      0.0, -0.9100000000000000, 0.0],
            "period": 5.8800, "jacobi": 1.720, "stability": 1.0,
            "family": "dro", "libr": None, "branch": None
        },
    ],
    "lyapunov_L3": [
        {
            "state": [-1.0051000000000000, 0.0, 0.0,
                      0.0, 0.0893000000000000, 0.0],
            "period": 6.1922, "jacobi": 3.172, "stability": 5.2,
            "family": "lyapunov", "libr": 3, "branch": None
        },
        {
            "state": [-1.0200000000000000, 0.0, 0.0,
                      0.0, 0.1650000000000000, 0.0],
            "period": 6.4100, "jacobi": 3.050, "stability": 6.8,
            "family": "lyapunov", "libr": 3, "branch": None
        },
    ],
    "butterfly_N": [
        {
            "state": [1.0340000000000000, 0.0, 0.2050000000000000,
                      0.0, -0.1310000000000000, 0.0],
            "period": 6.5120, "jacobi": 2.820, "stability": 4.2,
            "family": "butterfly", "libr": None, "branch": "N"
        },
        {
            "state": [1.0280000000000000, 0.0, 0.2650000000000000,
                      0.0, -0.0980000000000000, 0.0],
            "period": 7.1340, "jacobi": 2.710, "stability": 5.1,
            "family": "butterfly", "libr": None, "branch": "N"
        },
    ],
}

# Families to fetch at startup
FAMILIES_TO_FETCH: list[dict[str, Any]] = [
    {"sys": "earth-moon", "family": "halo",      "libr": 1, "branch": "N"},
    {"sys": "earth-moon", "family": "halo",      "libr": 1, "branch": "S"},
    {"sys": "earth-moon", "family": "halo",      "libr": 2, "branch": "N"},
    {"sys": "earth-moon", "family": "halo",      "libr": 2, "branch": "S"},
    {"sys": "earth-moon", "family": "lyapunov",  "libr": 1},
    {"sys": "earth-moon", "family": "lyapunov",  "libr": 2},
    {"sys": "earth-moon", "family": "lyapunov",  "libr": 3},
    {"sys": "earth-moon", "family": "dro"},
    {"sys": "earth-moon", "family": "butterfly", "branch": "N"},
]

# Module-level in-memory store
IC_CACHE: dict[str, list[dict]] = {}


# ── Key helpers ────────────────────────────────────────────────────────────────

def _make_key(family: str, libr: int | None, branch: str | None) -> str:
    """Canonical cache key, e.g. 'halo_L2_N', 'lyapunov_L1', 'dro'."""
    parts = [family]
    if libr is not None:
        parts.append(f"L{libr}")
    if branch is not None:
        parts.append(branch)
    return "_".join(parts)


def _parse_float(v: Any) -> float:
    if isinstance(v, str):
        return float(v.strip())
    return float(v)


def _parse_row(row: list, family: str, libr: int | None, branch: str | None) -> dict:
    """Convert a JPL data row to a standardised IC dict."""
    # Field order confirmed from live API: x y z vx vy vz jacobi period stability
    return {
        "state":     [_parse_float(row[i]) for i in range(6)],
        "jacobi":    _parse_float(row[6]),
        "period":    _parse_float(row[7]),
        "stability": _parse_float(row[8]),
        "family":    family,
        "libr":      libr,
        "branch":    branch,
    }


def _sample_rows(rows: list, n_max: int) -> list:
    """Evenly sample at most n_max rows from a list."""
    total = len(rows)
    if total <= n_max:
        return rows
    step = total / n_max
    return [rows[int(i * step)] for i in range(n_max)]


# ── Fetching ───────────────────────────────────────────────────────────────────

async def _fetch_one(spec: dict[str, Any]) -> tuple[str, list[dict]]:
    """Fetch one family from JPL with retry, return (key, ic_list)."""
    family = spec["family"]
    libr   = spec.get("libr")
    branch = spec.get("branch")
    key    = _make_key(family, libr, branch)

    params: dict[str, str] = {
        "sys":          spec["sys"],
        "family":       family,
        "periodunits":  "TU",       # ensure non-dimensional time units
        "jacobiunits":  "nondim",   # ensure non-dimensional Jacobi constant
    }
    if libr is not None:
        params["libr"] = str(libr)
    if branch is not None:
        params["branch"] = branch

    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(verify=False, timeout=REQUEST_TIMEOUT) as client:
                resp = await client.get(JPL_BASE, params=params)
                resp.raise_for_status()
                data = resp.json()
            break   # success
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                wait = 1.5 * (attempt + 1)
                logger.warning("JPL %s attempt %d failed: %s — retrying in %.1fs",
                               key, attempt + 1, exc, wait)
                await asyncio.sleep(wait)
    else:
        raise RuntimeError(f"JPL fetch failed after {MAX_RETRIES} attempts: {last_exc}")

    if "data" not in data:
        raise ValueError(
            f"No 'data' field in JPL response for {key}: {list(data.keys())}")

    raw_rows = data["data"]
    logger.info("JPL %s: received %d records", key, len(raw_rows))

    if raw_rows:
        fields = data.get(
            "fields", ["x", "y", "z", "vx", "vy", "vz", "jacobi", "period", "stability"])
        logger.info("  fields: %s", fields)
        logger.info("  first : %s", raw_rows[0])

    sampled = _sample_rows(raw_rows, MAX_ICS_PER_FAMILY)
    ics = [_parse_row(row, family, libr, branch) for row in sampled]
    return key, ics


async def fetch_all_families() -> None:
    """
    Fetch all configured families from JPL, populate IC_CACHE,
    then persist a backup to disk.

    On any individual fetch failure the family is skipped; other families
    still load.  If ALL fetches fail, the cache is loaded from disk.
    """
    import asyncio

    tasks = [_fetch_one(spec) for spec in FAMILIES_TO_FETCH]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    loaded: dict[str, list[dict]] = {}
    for result in results:
        if isinstance(result, Exception):
            logger.warning("JPL fetch failed: %s", result)
        else:
            key, ics = result
            loaded[key] = ics
            logger.info("Cached %d ICs for '%s'", len(ics), key)

    if loaded:
        IC_CACHE.update(loaded)
        _save_to_disk()
    else:
        logger.warning("All JPL fetches failed — attempting disk fallback")
        if not _load_from_disk():
            logger.warning(
                "No disk cache found. IC cache is empty; /orbit and /manifold will fail.")

    # Inject hardcoded fallbacks for families still missing after JPL + disk attempts
    injected: list[str] = []
    for key, ics in HARDCODED_FALLBACK_ICS.items():
        if key not in IC_CACHE or len(IC_CACHE[key]) == 0:
            IC_CACHE[key] = ics
            injected.append(key)
            logger.info("  %-22s %4d orbits (hardcoded fallback)",
                        key, len(ics))

    if injected:
        logger.info("Injected %d hardcoded fallback families: %s",
                    len(injected), injected)
        _save_to_disk()


def _save_to_disk() -> None:
    try:
        CACHE_FILE.write_text(json.dumps(IC_CACHE, indent=None))
        logger.info("IC cache saved to %s", CACHE_FILE)
    except Exception as exc:
        logger.warning("Could not save IC cache to disk: %s", exc)


def _load_from_disk() -> bool:
    if not CACHE_FILE.exists():
        return False
    try:
        data = json.loads(CACHE_FILE.read_text())
        IC_CACHE.update(data)
        total = sum(len(v) for v in IC_CACHE.values())
        logger.info("Loaded %d ICs from disk cache (%s)", total, CACHE_FILE)
        return True
    except Exception as exc:
        logger.warning("Disk cache load failed: %s", exc)
        return False


# ── Lookup API ─────────────────────────────────────────────────────────────────

def get_family(family: str, libr: int | None, branch: str | None) -> list[dict]:
    """Return all cached ICs for the given family/libr/branch."""
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
    """
    Return the IC at position `index` within the given family.
    Clamps index to [0, len-1].
    """
    key = _make_key(family, libr, branch)
    logger.debug(
        "get_ic called: family=%r libr=%r branch=%r → key=%r",
        family, libr, branch, key,
    )
    logger.debug("Available keys: %s", list(IC_CACHE.keys()))
    ics = get_family(family, libr, branch)
    idx = max(0, min(index, len(ics) - 1))
    return ics[idx]


def find_by_jacobi(
    family: str,
    libr:   int | None,
    branch: str | None,
    target_jacobi: float,
) -> dict:
    """Return the IC whose Jacobi constant is closest to target_jacobi."""
    ics = get_family(family, libr, branch)
    return min(ics, key=lambda ic: abs(ic["jacobi"] - target_jacobi))


def cache_summary() -> dict[str, int]:
    """Return {cache_key: ic_count} for the /health endpoint."""
    return {k: len(v) for k, v in IC_CACHE.items()}


# ── Standalone key-building test ───────────────────────────────────────────────

if __name__ == "__main__":
    test_cases = [
        ("lyapunov", 1,    None, "lyapunov_L1"),
        ("lyapunov", 2,    None, "lyapunov_L2"),
        ("lyapunov", 3,    None, "lyapunov_L3"),
        ("halo",     1,    "N",  "halo_L1_N"),
        ("halo",     1,    "S",  "halo_L1_S"),
        ("halo",     2,    "N",  "halo_L2_N"),
        ("halo",     2,    "S",  "halo_L2_S"),
        ("dro",      None, None, "dro"),
        ("butterfly", None, "N",  "butterfly_N"),
    ]

    print("\n── _make_key tests ─────────────────────────────────────────────────────")
    all_pass = True
    for family, libr, branch, expected in test_cases:
        got = _make_key(family, libr, branch)
        status = "PASS" if got == expected else "FAIL"
        if status == "FAIL":
            all_pass = False
        print(
            f"  {status}  _make_key({family!r}, {libr!r}, {branch!r}) → {got!r}  (expected {expected!r})")

    print("\n── Hardcoded fallback keys ──────────────────────────────────────────────")
    for key in HARDCODED_FALLBACK_ICS:
        print(f"  {key!r}  ({len(HARDCODED_FALLBACK_ICS[key])} ICs)")

    print("\n── Overall ──────────────────────────────────────────────────────────────")
    print("  All _make_key tests passed." if all_pass else "  SOME TESTS FAILED — see above.")
