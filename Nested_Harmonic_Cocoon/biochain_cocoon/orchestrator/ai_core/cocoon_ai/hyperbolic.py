"""
Hyperbolic state geometry, shared with the BioChain AI ecosystem.

The BioChain protocol (protocol/engram_shard.py) routes engrams by
hyperbolic proximity. It lifts a unit quaternion q = (w, x, y, z) onto the
hyperboloid H³ with the Lorentz lift Φ(q) = (1/w)(1, x, y, z), with |w|
floored at 0.12 to stay in a bounded annulus, and measures the Minkowski
quadrance Qh = ⟨ã, b̃⟩²_L − 1 = sinh² d_H.

The Guide uses the same geometry for the user's physiological state:

    q_state = normalise(calm, arousal, depth − ½, coherence)

so "how far is the user from the target state" is a hyperbolic distance.
Cocoon session trajectories and BioChain engrams therefore live in one
metric space, which the bridge exports. The functions are re-implemented here
(about 20 lines) so the cocoon never imports BioChain at runtime. The bridge
tests cross-check both implementations whenever the BioChain protocol
directory is present.

Hyperbolic distance grows roughly logarithmically near the target and
exponentially toward the boundary. That suits a controller: small
corrections near the goal, and strong but bounded pressure when far away.
"""
import math

from .bands import BAND_ORDER, band_index

W_FLOOR = 0.12


def qnorm(q):
    n = math.sqrt(sum(c * c for c in q)) or 1.0
    return tuple(c / n for c in q)


def lorentz_lift(q):
    w = max(abs(q[0]), W_FLOOR)
    return (1.0 / w, q[1] / w, q[2] / w, q[3] / w)


def hyper_quadrance(a, b):
    ip = a[0] * b[0] - (a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    return max(0.0, ip * ip - 1.0)


def hyperbolic_distance(qa, qb):
    """Geodesic distance d_H between the lifts of two unit quaternions."""
    return math.asinh(math.sqrt(hyper_quadrance(lorentz_lift(qa), lorentz_lift(qb))))


def state_quaternion(state, coherence=None):
    """BioState → unit quaternion. The w component is `calm`, so a calm user
    sits near the hyperboloid's apex and a stressed user drifts toward the
    boundary (w → floor), where distances stretch."""
    coh = state.calm if coherence is None else coherence
    w = 0.15 + 0.85 * state.calm
    return qnorm((w, state.arousal - 0.5, state.depth - 0.5, coh - 0.5))


def target_quaternion(band):
    """The ideal state quaternion for a target band: calm, arousal falling
    with depth, and depth set by the band's position (delta deepest)."""
    i = band_index(band)
    depth = 1.0 - i / (len(BAND_ORDER) - 1)
    arousal = {"delta": 0.1, "theta": 0.25, "alpha": 0.4, "beta": 0.6, "gamma": 0.65}[band]
    calm = {"delta": 0.95, "theta": 0.9, "alpha": 0.8, "beta": 0.6, "gamma": 0.7}[band]
    w = 0.15 + 0.85 * calm
    return qnorm((w, arousal - 0.5, depth - 0.5, calm - 0.5))
