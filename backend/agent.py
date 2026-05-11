"""
Agent layer — GPT-4o integration.

Uses OpenAI's JSON mode (response_format={"type":"json_object"}) to guarantee
valid JSON output. The system prompt constrains the model to the Manifold
command schema defined in Manifold_rulebook.md.
"""

import json
import logging
import os

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

_SYSTEM_PROMPT_TEMPLATE = """
You are an expert astrodynamicist controlling a cislunar orbital dynamics
visualizer. The system operates in the Earth-Moon CR3BP (Circular Restricted
Three-Body Problem) rotating frame, non-dimensional units.

AVAILABLE ORBIT FAMILIES — use these exact family_key strings, no others:
{available_families}

If the user requests a family not in the list above, explain it is unavailable and suggest
the closest alternative. Do NOT emit commands for unavailable families.

DECISION RULE — FAMILY vs SINGLE ORBIT:
- User says "family", "all orbits", "browse", "show the family", "show N orbits":
    → use show_family (renders many orbits with Jacobi gradient coloring)
- User says "show one orbit", "show an orbit", "plot the halo orbit":
    → use show_orbit (renders one orbit from a named family)
- User says "manifolds", "stable/unstable manifold":
    → use show_manifold (computes invariant manifold tubes for one orbit)

COMMAND SCHEMA — respond ONLY with valid JSON:

{{
  "commands": [
    {{
      "action": "show_family",
      "params": {{
        "family_key": "halo_L2_N",
        "n": 20
      }}
    }},
    {{
      "action": "show_orbit",
      "params": {{
        "family": "lyapunov|halo_N|halo_S|butterfly_N",
        "libr": 1|2|3|null,
        "index": 0
      }}
    }},
    {{
      "action": "show_manifold",
      "params": {{
        "family": "lyapunov|halo_N|halo_S|butterfly_N",
        "libr": 1|2|3|null,
        "index": 0,
        "type": "stable|unstable|both",
        "n_branches": 80
      }}
    }},
    {{
      "action": "show_lagrange",
      "params": {{}}
    }},
    {{
      "action": "clear",
      "params": {{}}
    }},
    {{
      "action": "camera_move",
      "params": {{
        "preset": "top|side|default"
      }}
    }}
  ],
  "explanation": "2-3 sentences. Lead with the intuitive concept. Use analogies. Accessible to non-experts but technically accurate.",
  "suggested_next": "One follow-up prompt the user might want to try."
}}

For show_family: n should be 20 by default; increase to 40-50 if user asks for "many" or "all".
For show_orbit: map family names as follows — "halo_N" + libr, "halo_S" + libr, "lyapunov" + libr, "butterfly_N".
Multiple commands are allowed — e.g. show_orbit + show_manifold simultaneously.

MISSION DESIGN COMMANDS:

When the user wants a multi-leg trajectory or mission, use "design_mission".

{{
  "action": "design_mission",
  "params": {{
    "description": "plain English summary of the mission",
    "legs": [
      {{
        "type": "orbit",
        "family": "lyapunov|halo_N|halo_S",
        "libr": 1,
        "index": 0,
        "label": "L1 Lyapunov orbit"
      }},
      {{
        "type": "manifold_departure",
        "family": "lyapunov|halo_N|halo_S",
        "libr": 1,
        "index": 0,
        "manifold_type": "unstable",
        "branch_index": 0,
        "label": "Depart via unstable manifold"
      }},
      {{
        "type": "manifold_arrival",
        "family": "lyapunov|halo_N|halo_S",
        "libr": 2,
        "index": 0,
        "manifold_type": "stable",
        "branch_index": 5,
        "label": "Arrive via stable manifold"
      }}
    ]
  }}
}}

Keep missions to 2-4 legs. ONLY use families from the available list above.
The spacecraft dot animates each leg in sequence — order matters.

If a request is outside your capabilities, return valid JSON with commands=[] and explain.
Never hallucinate orbital mechanics facts.
Never return anything other than valid JSON.
"""

_FALLBACK = {
    "commands": [],
    "explanation": "The agent encountered an error. Please try again.",
    "suggested_next": "Show me a halo orbit around L2.",
}


_KEY_DESCRIPTIONS: dict[str, str] = {
    "halo_L1_N":        "L1 Northern Halo",
    "halo_L1_S":        "L1 Southern Halo",
    "halo_L2_N":        "L2 Northern Halo",
    "halo_L2_S":        "L2 Southern Halo",
    "halo_L3_N":        "L3 Northern Halo",
    "halo_L3_S":        "L3 Southern Halo",
    "lyapunov_L1":      "L1 Lyapunov",
    "lyapunov_L2":      "L2 Lyapunov",
    "lyapunov_L3":      "L3 Lyapunov",
    "butterfly_N":      "Butterfly North",
    "butterfly_S":      "Butterfly South",
    "dragonfly_N":      "Dragonfly North",
    "dragonfly_S":      "Dragonfly South",
    "axial_L1":         "L1 Axial",
    "axial_L2":         "L2 Axial",
    "axial_L3":         "L3 Axial",
    "axial_L4":         "L4 Axial",
    "axial_L5":         "L5 Axial",
    "vertical_L1":      "L1 Vertical",
    "vertical_L2":      "L2 Vertical",
    "vertical_L3":      "L3 Vertical",
    "vertical_L4":      "L4 Vertical",
    "vertical_L5":      "L5 Vertical",
    "long_period_L4":   "L4 Long Period",
    "long_period_L5":   "L5 Long Period",
    "short_period_L4":  "L4 Short Period",
    "short_period_L5":  "L5 Short Period",
    "distant_prograde": "Distant Prograde",
    "distant_retrograde": "Distant Retrograde",
    "low_prograde_E":   "Low Prograde (East)",
    "low_prograde_W":   "Low Prograde (West)",
}


def _build_system_prompt(available_keys: list[str]) -> str:
    if available_keys:
        lines = "\n".join(
            f"  {k:<22} — {_KEY_DESCRIPTIONS.get(k, k)}"
            for k in sorted(available_keys)
        )
    else:
        lines = "  (none loaded yet)"
    return _SYSTEM_PROMPT_TEMPLATE.format(available_families=lines)


async def query_agent(user_message: str, available_families: list[str] | None = None) -> dict:
    """
    Send user_message to GPT-4o and parse the JSON response.

    OpenAI's json_object response format guarantees the output is valid JSON.
    On any failure (API error, parse error, unexpected shape) returns a safe
    fallback dict with commands=[].
    """
    system_prompt = _build_system_prompt(available_families or [])
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            max_tokens=2000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
        )
        content = response.choices[0].message.content or ""
        parsed  = json.loads(content)

        # Ensure required keys exist
        if "commands" not in parsed:
            parsed["commands"] = []
        if "explanation" not in parsed:
            parsed["explanation"] = ""
        if "suggested_next" not in parsed:
            parsed["suggested_next"] = ""

        return parsed

    except Exception as exc:
        logger.error("Agent query failed: %s", exc)
        return {
            **_FALLBACK,
            "explanation": f"Agent error: {exc}. Please try again.",
        }
