"""
cocoon_ai: the "Guide", the Harmonic Cocoon's closed-loop biofeedback AI.

Pure standard library and deterministic. It has no dependency on the
backend, the network, or BioChain, so it can be unit-tested on its own and
swapped for a learned policy (for example a hyperbolic model trained in the
BioChain AI ecosystem) through the GuidePolicy interface.

    biostate   : biofeedback frames → BioState (HRV, EEG bands, GSR)
    hyperbolic : BioState ↔ unit quaternion ↔ Lorentz lift onto H³, distance to target
    guide      : BioState + target → next geometric command (+ rationale)
    zones      : per-zone GSR → body focus coordinate (chakra/zone mapping)
    bands      : brainwave band table, solfeggio carriers, zone heights
"""
from .bands import BANDS, band_of, SOLFEGGIO, ZONES
from .biostate import BioState, BiostateEstimator
from .hyperbolic import state_quaternion, target_quaternion, lorentz_lift, hyperbolic_distance
from .guide import GeoCommand, GuidePolicy, RuleGuide
from .zones import ZoneMapper

__all__ = [
    "BANDS", "band_of", "SOLFEGGIO", "ZONES",
    "BioState", "BiostateEstimator",
    "state_quaternion", "target_quaternion", "lorentz_lift", "hyperbolic_distance",
    "GeoCommand", "GuidePolicy", "RuleGuide", "ZoneMapper",
]
