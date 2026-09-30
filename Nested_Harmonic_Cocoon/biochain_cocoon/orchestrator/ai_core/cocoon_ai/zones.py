"""
Zone (chakra) mapper: per-zone GSR resistance → where to focus.

The system spec asks the AI to "detect resistance in specific body zones" and
steer spatial energy there. This mapper picks the zone with the largest
sustained conductance rise over its baseline, with hysteresis so the focus
does not flicker between zones. It returns the zone's body coordinate for
the spatial panner. The zone model is contemplative, not anatomical, and is
documented as such.
"""
from .bands import ZONES, SOLFEGGIO


class ZoneMapper:
    def __init__(self, threshold=0.08, hysteresis=0.04, hold_updates=5):
        self.threshold = threshold
        self.hysteresis = hysteresis
        self.hold_updates = hold_updates
        self.focus = None
        self._candidate = None
        self._count = 0

    def update(self, resistance):
        """resistance: {zone: relative rise ≥ 0}. Returns the focus zone or None."""
        if not resistance:
            return self.focus
        best = max(resistance, key=resistance.get)
        level = resistance[best]
        if self.focus and resistance.get(self.focus, 0.0) >= self.threshold - self.hysteresis \
                and level < resistance.get(self.focus, 0.0) + self.hysteresis:
            self._candidate, self._count = None, 0
            return self.focus                      # current focus still holds
        if level < self.threshold:
            if self.focus and resistance.get(self.focus, 0.0) < self.threshold - self.hysteresis:
                self.focus = None                  # coherence reached, release
            return self.focus
        if best == self._candidate:
            self._count += 1
        else:
            self._candidate, self._count = best, 1
        if self._count >= self.hold_updates:
            self.focus, self._candidate, self._count = best, None, 0
        return self.focus

    @staticmethod
    def coordinate(zone):
        """(x, y, z) in metres, user-centred: zones lie along +y (toward the head)."""
        return (0.0, ZONES[zone] - 0.4, 0.0)       # body centre (heart) at y ≈ 0

    @staticmethod
    def carrier(zone):
        return SOLFEGGIO[zone]
