"""Reference tables: brainwave bands, carriers, and body zones."""

# name: (low Hz, high Hz, default entrainment Hz)
BANDS = {
    "delta": (0.5, 4.0, 2.0),
    "theta": (4.0, 8.0, 6.0),
    "alpha": (8.0, 13.0, 10.0),
    "beta":  (13.0, 30.0, 18.0),
    "gamma": (30.0, 45.0, 40.0),
}
BAND_ORDER = ["delta", "theta", "alpha", "beta", "gamma"]

SCHUMANN_HZ = 7.83

# Carrier choices. The "solfeggio" pairings are traditional and not
# physiologically validated; they are offered as defaults, not as claims.
SOLFEGGIO = {
    "root": 396.0, "sacral": 417.0, "solar_plexus": 528.0, "heart": 639.0,
    "throat": 741.0, "third_eye": 852.0, "crown": 963.0,
}
CALM_CARRIER = 432.0
GROUNDING_CARRIER = 396.0

# Zone → approximate height (metres) above the surface for a reclining user,
# measured along the body axis from the pelvis (y axis in cocoon coordinates:
# +y toward the head). Used to steer spatial energy to a zone.
ZONES = {
    "root": 0.00, "sacral": 0.10, "solar_plexus": 0.25, "heart": 0.40,
    "throat": 0.55, "third_eye": 0.68, "crown": 0.78,
}
ZONE_ORDER = list(ZONES)


def band_of(hz):
    """Name of the band containing `hz` (clamped to delta/gamma at the ends)."""
    for name in BAND_ORDER:
        lo, hi, _ = BANDS[name]
        if hz < hi:
            return name
    return "gamma"


def band_index(name):
    return BAND_ORDER.index(name)
