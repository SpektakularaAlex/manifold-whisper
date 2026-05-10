"""
CR3BP engine — Earth-Moon system, non-dimensional rotating frame.

Units:
    Length   : 1 LU = 384,400 km  (Earth-Moon distance)
    Time     : 1 TU = 1/ω ≈ 4.343 days  (ω = mean motion)
    Mass     : normalized so G·(m1+m2) = 1

Primaries (Broucke convention):
    Earth at x = -μ,      mass = 1-μ
    Moon  at x = 1-μ,     mass = μ
"""

import numpy as np
from scipy.integrate import solve_ivp

MU = 0.01215058560962404   # Earth-Moon mass ratio


# ── Equations of motion ────────────────────────────────────────────────────────

def eom_3d(t: float, state: np.ndarray, mu: float = MU) -> list[float]:
    """
    Full 3D CR3BP equations of motion in the rotating frame.

    Args:
        t     : time (unused — autonomous system)
        state : [x, y, z, vx, vy, vz]  (non-dimensional)
        mu    : mass parameter

    Returns:
        [vx, vy, vz, ax, ay, az]
    """
    x, y, z, vx, vy, vz = state

    r1 = np.sqrt((x + mu)**2 + y**2 + z**2)       # Earth distance
    r2 = np.sqrt((x - 1.0 + mu)**2 + y**2 + z**2) # Moon distance

    r1_3 = r1**3
    r2_3 = r2**3

    ax = 2.0*vy + x - (1.0 - mu)*(x + mu)/r1_3 - mu*(x - 1.0 + mu)/r2_3
    ay = -2.0*vx + y - (1.0 - mu)*y/r1_3 - mu*y/r2_3
    az = -(1.0 - mu)*z/r1_3 - mu*z/r2_3

    return [vx, vy, vz, ax, ay, az]


def cr3bp_jacobian(state: np.ndarray, mu: float) -> np.ndarray:
    """
    6×6 variational matrix A(t) = ∂f/∂X at the given state.

    Used for integrating the STM: dΦ/dt = A(t) · Φ.
    All second partial derivatives of Ω are fully analytic.
    """
    x, y, z = state[0], state[1], state[2]
    omm = 1.0 - mu  # 1 - mu

    r1 = np.sqrt((x + mu)**2 + y**2 + z**2)
    r2 = np.sqrt((x - 1.0 + mu)**2 + y**2 + z**2)
    r1_3, r1_5 = r1**3, r1**5
    r2_3, r2_5 = r2**3, r2**5

    Omxx = (1 - omm/r1_3 - mu/r2_3
            + 3*omm*(x + mu)**2/r1_5
            + 3*mu*(x - 1.0 + mu)**2/r2_5)
    Omyy = (1 - omm/r1_3 - mu/r2_3
            + 3*omm*y**2/r1_5
            + 3*mu*y**2/r2_5)
    Omzz = (-omm/r1_3 - mu/r2_3
            + 3*omm*z**2/r1_5
            + 3*mu*z**2/r2_5)
    Omxy = 3*omm*(x + mu)*y/r1_5 + 3*mu*(x - 1.0 + mu)*y/r2_5
    Omxz = 3*omm*(x + mu)*z/r1_5 + 3*mu*(x - 1.0 + mu)*z/r2_5
    Omyz = 3*omm*y*z/r1_5 + 3*mu*y*z/r2_5

    A = np.zeros((6, 6))
    A[0:3, 3:6] = np.eye(3)                          # velocity → position
    A[3:6, 0:3] = [[Omxx, Omxy, Omxz],               # gravity second partials
                    [Omxy, Omyy, Omyz],
                    [Omxz, Omyz, Omzz]]
    A[3, 4] =  2.0   # Coriolis
    A[4, 3] = -2.0
    return A


def eom_stm(t: float, state_aug: np.ndarray, mu: float) -> np.ndarray:
    """
    Augmented 42-D system: 6 EOM + 36 variational equations for the STM.

    state_aug: flat array of length 42
        [0:6]   state [x, y, z, vx, vy, vz]
        [6:42]  STM Φ, stored row-major (C-order): Φ₁₁,Φ₁₂,...,Φ₆₆

    Variational equation: dΦ/dt = A(t) · Φ
    """
    state = state_aug[:6]
    Phi   = state_aug[6:].reshape(6, 6)   # C-order (row-major) = correct

    d_state = np.array(eom_3d(t, state, mu))
    A       = cr3bp_jacobian(state, mu)
    d_Phi   = A @ Phi

    return np.concatenate([d_state, d_Phi.flatten()])


# ── Propagators ────────────────────────────────────────────────────────────────

def propagate(
    state0: np.ndarray | list,
    T: float,
    mu: float = MU,
    n_points: int = 500,
) -> np.ndarray:
    """
    Integrate eom_3d from t=0 to t=T using DOP853.

    Args:
        state0   : initial state [x, y, z, vx, vy, vz]
        T        : propagation time (TU).  Negative = backward integration.
        mu       : mass parameter
        n_points : number of output points (uniformly spaced in time)

    Returns:
        ndarray shape (n_points, 6)
    """
    t_eval = np.linspace(0.0, T, n_points)
    sol = solve_ivp(
        eom_3d,
        (0.0, T),
        np.asarray(state0, dtype=float),
        args=(mu,),
        method="DOP853",
        t_eval=t_eval,
        rtol=1e-10,
        atol=1e-12,
    )
    if not sol.success:
        raise RuntimeError(f"propagate failed: {sol.message}")
    return sol.y.T  # shape (n_points, 6)


def propagate_with_stm(
    state0: np.ndarray | list,
    T: float,
    mu: float = MU,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Integrate the augmented 42-D system (EOM + STM variational equations).

    Returns:
        trajectory      : ndarray (500, 6)
        monodromy_matrix: ndarray (6, 6) — STM evaluated at t=T
    """
    s0 = np.asarray(state0, dtype=float)
    y0 = np.concatenate([s0, np.eye(6).flatten()])

    t_eval = np.linspace(0.0, T, 500)
    sol = solve_ivp(
        eom_stm,
        (0.0, T),
        y0,
        args=(mu,),
        method="DOP853",
        t_eval=t_eval,
        rtol=1e-10,
        atol=1e-12,
    )
    if not sol.success:
        raise RuntimeError(f"propagate_with_stm failed: {sol.message}")

    trajectory = sol.y[:6, :].T
    monodromy  = sol.y[6:, -1].reshape(6, 6)
    return trajectory, monodromy


def propagate_with_stm_dense(
    state0: np.ndarray | list,
    T: float,
    mu: float = MU,
) -> tuple[object, np.ndarray]:
    """
    Integrate the augmented 42-D system with dense_output=True.

    Returns (sol, monodromy) where:
        sol.sol(t) → ndarray(42,) at any t ∈ [0, T]
        monodromy  → Φ(T), the 6×6 monodromy matrix
    """
    y0 = np.concatenate([np.asarray(state0, dtype=float), np.eye(6).flatten()])

    sol = solve_ivp(
        eom_stm,
        (0.0, T),
        y0,
        args=(mu,),
        method="DOP853",
        rtol=1e-10,
        atol=1e-12,
        dense_output=True,
    )
    if not sol.success:
        raise RuntimeError(f"propagate_with_stm_dense failed: {sol.message}")

    monodromy = sol.y[6:, -1].reshape(6, 6)
    return sol, monodromy


# ── Orbital invariants ────────────────────────────────────────────────────────

def jacobi_constant(state: np.ndarray | list, mu: float = MU) -> float:
    """
    Jacobi constant C = 2Ω - v²

    where Ω = ½(x²+y²) + (1-μ)/r1 + μ/r2
    and   v² = vx²+vy²+vz²
    """
    s = np.asarray(state, dtype=float)
    x, y, z, vx, vy, vz = s

    r1 = np.sqrt((x + mu)**2 + y**2 + z**2)
    r2 = np.sqrt((x - 1.0 + mu)**2 + y**2 + z**2)

    Omega = 0.5*(x**2 + y**2) + (1.0 - mu)/r1 + mu/r2
    v2    = vx**2 + vy**2 + vz**2

    return float(2.0*Omega - v2)
