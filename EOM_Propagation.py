import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt
import sympy as sp
np.set_printoptions(precision=16, suppress=False)

# mu = 0.012155092
mu = 1.215058560962404E-2


def eom_cart_pcr3bp(t, X):
    """
    PCR3BP equations of motion in Broucke's convention.

    Primaries:
        m1 (Earth, mass = 1-mu) at x1 = -mu
        m2 (Moon,  mass =   mu) at x2 = 1 - mu
    """
    x, y, xd, yd = X

    # Primary positions
    x1 = -mu        # Earth
    x2 = 1.0 - mu   # Moon

    r1 = np.sqrt((x - x1)**2 + y**2)
    r2 = np.sqrt((x - x2)**2 + y**2)

    "Accelerations"
    xdd = 2*yd + x - (1 - mu)*(x - x1)/r1**3 - mu*(x - x2)/r2**3
    ydd = -2*xd + y - (1 - mu)*y / r1**3 - mu*y / r2**3

    return [xd, yd, xdd, ydd]
