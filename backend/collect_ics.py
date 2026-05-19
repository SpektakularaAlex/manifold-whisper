#!/usr/bin/env python3
"""
One-time script to collect periodic orbit ICs from JPL API
for all non-Earth-Moon CR3BP systems.

Run from the backend/ directory:
    python3 collect_ics.py

Output: IC_Orbits/<SystemName>/<family_key>.json
Each JSON file contains a list of IC dicts.
"""

import httpx
import json
import time
from pathlib import Path

JPL_BASE = "https://ssd-api.jpl.nasa.gov/periodic_orbits.api"
SAMPLE_SIZE = 100   # ICs per family (evenly sampled)
DELAY = 0.5         # seconds between requests (be polite to JPL)

COLLECTION_PLAN = [
    {
        "folder": "Sun-Earth",
        "jpl_sys": "sun-earth",
        "families": [
            ("halo",     1, "N", "halo_L1_N"),
            ("halo",     1, "S", "halo_L1_S"),
            ("halo",     2, "N", "halo_L2_N"),
            ("halo",     2, "S", "halo_L2_S"),
            ("lyapunov", 1, None, "lyapunov_L1"),
            ("lyapunov", 2, None, "lyapunov_L2"),
            ("lyapunov", 3, None, "lyapunov_L3"),
            ("dro",      None, None, "dro"),
        ]
    },
    {
        "folder": "Jupiter-Europa",
        "jpl_sys": "jupiter-europa",
        "families": [
            ("halo",     1, "N", "halo_L1_N"),
            ("halo",     1, "S", "halo_L1_S"),
            ("halo",     2, "N", "halo_L2_N"),
            ("halo",     2, "S", "halo_L2_S"),
            ("lyapunov", 1, None, "lyapunov_L1"),
            ("lyapunov", 2, None, "lyapunov_L2"),
            ("dro",      None, None, "dro"),
        ]
    },
    {
        "folder": "Saturn-Enceladus",
        "jpl_sys": "saturn-enceladus",
        "families": [
            ("halo",     1, "N", "halo_L1_N"),
            ("halo",     1, "S", "halo_L1_S"),
            ("halo",     2, "N", "halo_L2_N"),
            ("halo",     2, "S", "halo_L2_S"),
            ("lyapunov", 1, None, "lyapunov_L1"),
            ("lyapunov", 2, None, "lyapunov_L2"),
        ]
    },
    {
        "folder": "Saturn-Titan",
        "jpl_sys": "saturn-titan",
        "families": [
            ("halo",      1, "N", "halo_L1_N"),
            ("halo",      1, "S", "halo_L1_S"),
            ("halo",      2, "N", "halo_L2_N"),
            ("halo",      2, "S", "halo_L2_S"),
            ("lyapunov",  1, None, "lyapunov_L1"),
            ("lyapunov",  2, None, "lyapunov_L2"),
            ("dro",       None, None, "dro"),
            ("butterfly", None, "N", "butterfly_N"),
        ]
    },
    {
        "folder": "Mars-Phobos",
        "jpl_sys": "mars-phobos",
        "families": [
            ("halo",     1, "N", "halo_L1_N"),
            ("halo",     1, "S", "halo_L1_S"),
            ("halo",     2, "N", "halo_L2_N"),
            ("halo",     2, "S", "halo_L2_S"),
            ("lyapunov", 1, None, "lyapunov_L1"),
            ("lyapunov", 2, None, "lyapunov_L2"),
        ]
    },
]


def fetch_family(jpl_sys: str, family: str, libr, branch) -> list:
    params: dict = {"sys": jpl_sys, "family": family}
    if libr is not None:
        params["libr"] = libr
    if branch is not None:
        params["branch"] = branch
    try:
        resp = httpx.get(JPL_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "warning" in data:
            print(f"    WARNING from JPL: {data['warning']}")
            return []
        return data.get("data", [])
    except Exception as e:
        print(f"    ERROR fetching: {e}")
        return []


def sample_evenly(records: list, n: int) -> list:
    if len(records) <= n:
        return records
    step = len(records) / n
    return [records[int(i * step)] for i in range(n)]


def records_to_ics(records: list, family: str, libr, branch, jpl_sys: str) -> list:
    ics = []
    for row in records:
        try:
            ic = {
                "state": [float(row[0]), float(row[1]), float(row[2]),
                          float(row[3]), float(row[4]), float(row[5])],
                "jacobi":    float(row[6]),
                "period":    float(row[7]),
                "stability": float(row[8]),
                "family":    family,
                "libr":      libr,
                "branch":    branch,
                "system":    jpl_sys,
            }
            ics.append(ic)
        except (IndexError, ValueError) as e:
            print(f"    Skipping bad record: {e}")
    return ics


def main() -> None:
    script_dir = Path(__file__).parent
    ic_orbits = script_dir.parent / "IC_Orbits"

    if not ic_orbits.exists():
        print(f"ERROR: IC_Orbits directory not found at {ic_orbits}")
        return

    total_collected = 0

    for system in COLLECTION_PLAN:
        folder = system["folder"]
        jpl_sys = system["jpl_sys"]
        system_dir = ic_orbits / folder
        system_dir.mkdir(exist_ok=True)

        print(f"\n{'='*50}")
        print(f"System: {folder} (JPL: {jpl_sys})")
        print(f"Output: {system_dir}")
        print(f"{'='*50}")

        for (family, libr, branch, cache_key) in system["families"]:
            out_file = system_dir / f"{cache_key}.json"

            if out_file.exists():
                existing = json.loads(out_file.read_text())
                if existing:
                    print(f"  {cache_key}: already exists ({len(existing)} ICs), skipping")
                    total_collected += len(existing)
                    continue

            print(f"  {cache_key}: fetching from JPL...", end="", flush=True)

            raw = fetch_family(jpl_sys, family, libr, branch)
            if not raw:
                print(" NO DATA")
                out_file.write_text("[]")
                continue

            sampled = sample_evenly(raw, SAMPLE_SIZE)
            ics = records_to_ics(sampled, family, libr, branch, jpl_sys)

            out_file.write_text(json.dumps(ics, indent=2))
            total_collected += len(ics)
            print(f" {len(ics)} ICs saved (from {len(raw)} total)")
            time.sleep(DELAY)

    print(f"\n{'='*50}")
    print(f"DONE. Total ICs collected: {total_collected}")
    print(f"Files saved to: {ic_orbits}")
    print("\nNext steps:")
    print("  1. Restart backend — it will auto-load these via ensure_system_loaded()")


if __name__ == "__main__":
    main()
