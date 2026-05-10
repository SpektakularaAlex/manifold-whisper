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

CRITICAL — currently available orbit families (requesting ANY OTHER family will produce an error):
{available_families}

If the user requests a family/libr combination not in that list, explain it is not currently
loaded and suggest the closest available alternative. Do NOT emit a show_orbit or show_manifold
command for an unavailable family.

Family name encoding for commands:
- "lyapunov" + libr=1 or 2 or 3  → planar Lyapunov orbit at that Lagrange point
- "halo_N" + libr=1 or 2          → northern 3D halo orbit
- "halo_S" + libr=1 or 2          → southern 3D halo orbit
- "dro"    + libr=null             → distant retrograde orbit
- "butterfly_N" + libr=null        → butterfly orbit

When the user asks to visualize something, respond ONLY with valid JSON
matching this schema exactly:

{{
  "commands": [
    {{
      "action": "show_orbit",
      "params": {{
        "family": "lyapunov|halo_N|halo_S|dro|butterfly_N",
        "libr": 1|2|3|null,
        "index": 0
      }}
    }},
    {{
      "action": "show_manifold",
      "params": {{
        "family": "lyapunov|halo_N|halo_S|dro|butterfly_N",
        "libr": 1|2|3|null,
        "index": 0,
        "type": "stable|unstable|both",
        "n_branches": 40,
        "propagation_time": 3.0
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

Multiple commands are allowed in one response. Use them together
(e.g. show_orbit + show_manifold simultaneously).

MISSION DESIGN COMMANDS:

When the user wants to design a multi-leg trajectory or mission,
use the "design_mission" action instead of show_orbit/show_manifold.

{{
  "action": "design_mission",
  "params": {{
    "description": "plain English summary of the mission",
    "legs": [
      {{
        "type": "orbit",
        "family": "lyapunov|halo_N|halo_S|dro",
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

For cislunar mission examples:
- "Go from L1 to L2 Lyapunov":
    leg 1: orbit (L1 Lyapunov)
    leg 2: manifold_departure (unstable, L1 Lyapunov)
    leg 3: manifold_arrival (stable, L2 Lyapunov)
    leg 4: orbit (L2 Lyapunov)
- "Show departure from L2 halo":
    leg 1: orbit (halo_N L2)
    leg 2: manifold_departure (unstable, halo_N L2)

Keep missions to 2-4 legs. ONLY use families present in the available list above.
The spacecraft dot animates each leg in sequence — order matters.

If a request is outside your capabilities, still return valid JSON but
with an empty commands array and explain the limitation in the explanation field.
Never hallucinate orbital mechanics facts.
Never return anything other than valid JSON.
"""

_FALLBACK = {
    "commands": [],
    "explanation": "The agent encountered an error. Please try again.",
    "suggested_next": "Show me a halo orbit around L2.",
}


def _build_system_prompt(available_keys: list[str]) -> str:
    if available_keys:
        lines = "\n".join(f"  - {k}" for k in sorted(available_keys))
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
