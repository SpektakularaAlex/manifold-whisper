"""
3D Invariant Manifold Computation for CR3BP

Method summary:
1. Integrate orbit + STM for one period T with dense_output=True (42-D system)
2. Extract monodromy M = Φ(T); find saddle eigenpair (|λ|>>1, |λ|<<1)
3. At N sample points along the orbit:
     a. Evaluate Φ(t_i) from the dense solution
     b. Map eigenvector: v(t_i) = Φ(t_i) @ v_0, normalize
     c. Enforce sign consistency (dot product check against previous)
     d. Perturb: state(t_i) ± ε · v(t_i)
4. Propagate each perturbed IC forward (unstable) or backward (stable)

Returns are split into plus/minus half-tubes so the frontend can color them
distinctly (interior vs exterior of the tube surface).

Key notes:
- ε = 1e-5 (not 1e-6): large halo eigenvalues (|λ| ~ 10³–10⁶) swamp 1e-6
- STM reshape is always C-order (numpy default = row-major = correct)
- Sign consistency: Φ(t_i) can flip the eigenvector direction by π between
  samples; without this check the tube collapses to garbage in 3D
"""

import logging

import numpy as np
from scipy.integrate import solve_ivp

from cr3bp import MU, eom_3d, propagate_with_stm_dense

logger = logging.getLogger(__name__)


def _select_saddle_eigenpair(monodromy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    From a 6×6 monodromy matrix extract unstable and stable eigenvectors
    of the real saddle pair.

    Eigenvalue structure for a 3D halo:
      - 1 real pair |λ| >> 1  : hyperbolic (manifold directions)
      - 2 pairs near unit circle: center-like (ignore)
      - Symplectic constraint: product of all |λ| = 1

    Returns (v_unstable, v_stable) normalised real arrays.
    """
    eigenvalues, eigenvectors = np.linalg.eig(monodromy)
    magnitudes = np.abs(eigenvalues)

    logger.info("Monodromy |eigenvalues|: %s", np.round(magnitudes, 6))
    logger.info("Symplecticity check: prod(|λ|) = %.6f", np.prod(magnitudes))

    # Unstable: largest |λ|
    unstable_idx = np.argmax(magnitudes)
    v_u = np.real(eigenvectors[:, unstable_idx])
    v_u /= np.linalg.norm(v_u)

    # Stable: smallest nonzero |λ|
    nonzero = np.where(magnitudes > 1e-10, magnitudes, np.inf)
    stable_idx = np.argmin(nonzero)
    v_s = np.real(eigenvectors[:, stable_idx])
    v_s /= np.linalg.norm(v_s)

    logger.info(
        "Saddle pair: unstable idx=%d |λ|=%.4f  stable idx=%d |λ|=%.4f",
        unstable_idx, magnitudes[unstable_idx],
        stable_idx,   magnitudes[stable_idx],
    )
    return v_u, v_s


def compute_manifold(
    ic: dict,
    mu: float = MU,
    stable: bool = False,
    n_branches: int = 80,
    t_forward: float = 8.0,
    t_backward: float = 10.0,
    epsilon: float = 1e-5,
) -> tuple[list[list[list[float]]], list[list[list[float]]]]:
    """
    Compute 3D invariant manifold half-tubes for a periodic orbit.

    Args:
        ic             : IC dict from ic_cache (must have 'state' and 'period')
        mu             : CR3BP mass parameter
        stable         : False → unstable manifold, True → stable manifold
        n_branches     : total branch count (n_branches/2 from +ε, n_branches/2 from -ε)
        t_forward      : propagation time for unstable manifold (TU)
        t_backward     : propagation time for stable manifold (TU, integrated backward)
        epsilon        : perturbation magnitude (non-dimensional)

    Returns:
        (plus_tubes, minus_tubes) where each is a list of [[x,y,z],...] trajectories.
        plus_tubes  ← perturbations in the +ε direction
        minus_tubes ← perturbations in the -ε direction
    """
    state0 = np.array(ic["state"], dtype=float)
    T      = float(ic["period"])

    # ── Step 1: integrate orbit + STM with dense output ────────────────────
    sol, monodromy = propagate_with_stm_dense(state0, T, mu)

    # ── Step 2: extract saddle eigenpair from monodromy ────────────────────
    v_u, v_s = _select_saddle_eigenpair(monodromy)
    v0 = v_s if stable else v_u

    # ── Step 3: map eigenvector at sample points with sign consistency ──────
    n_half    = n_branches // 2
    t_samples = np.linspace(0.0, T, n_half, endpoint=False)

    plus_ics:  list[np.ndarray] = []
    minus_ics: list[np.ndarray] = []
    v_prev = v0.copy()

    for t_i in t_samples:
        z_i      = sol.sol(t_i)
        state_i  = z_i[:6]
        Phi_i    = z_i[6:].reshape(6, 6)   # C-order (row-major) — correct

        # Map global eigenvector to local orbit position through the STM
        v_local = Phi_i @ v0
        v_local  = np.real(v_local)
        norm     = np.linalg.norm(v_local)
        if norm < 1e-14:
            continue
        v_local /= norm

        # Enforce sign consistency — Φ(t_i) can rotate v by π between samples
        if np.dot(v_local, v_prev) < 0:
            v_local = -v_local
        v_prev = v_local.copy()

        plus_ics.append(state_i + epsilon * v_local)
        minus_ics.append(state_i - epsilon * v_local)

    # ── Step 4: propagate each perturbed IC ────────────────────────────────
    # Stable manifold: integrate backward in time
    T_prop = -(t_backward) if stable else t_forward

    def _propagate_branch(ic_state: np.ndarray) -> list[list[float]] | None:
        try:
            result = solve_ivp(
                eom_3d,
                [0.0, T_prop],
                ic_state,
                args=(mu,),
                method="DOP853",
                rtol=1e-9,
                atol=1e-11,
                dense_output=False,
                max_step=abs(T_prop) / 50,
            )
            traj = result.y[:3].T   # (n_steps, 3)
            if len(traj) > 200:
                idx  = np.linspace(0, len(traj) - 1, 200, dtype=int)
                traj = traj[idx]
            # Discard trajectories that escape to infinity
            if np.any(np.abs(traj) > 20.0):
                return None
            return traj.tolist()
        except Exception:
            return None

    plus_tubes:  list[list[list[float]]] = []
    minus_tubes: list[list[list[float]]] = []

    for ic_state in plus_ics:
        t = _propagate_branch(ic_state)
        if t is not None:
            plus_tubes.append(t)

    for ic_state in minus_ics:
        t = _propagate_branch(ic_state)
        if t is not None:
            minus_tubes.append(t)

    label = "stable" if stable else "unstable"
    logger.info(
        "compute_manifold: %s  requested=%d  plus=%d  minus=%d tubes",
        label, n_branches, len(plus_tubes), len(minus_tubes),
    )
    return plus_tubes, minus_tubes
