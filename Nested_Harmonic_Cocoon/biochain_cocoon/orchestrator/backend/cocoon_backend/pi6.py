"""
Master geometric clock and the pi6 handshake scheduler.

The orchestrator owns the master entrainment phase θ(t), which integrates
the current macro frequency f_e(t), including its glides. Whenever θ crosses a
π/6 marker, the scheduler may emit a Pi6Sync packet carrying the sector k
(0..11) and θ = k·π/6. Pucks slew toward it; they never jump.

Rate cap: sync at *every* marker would be 12·f_e packets/s (480/s at 40 Hz
gamma). The scheduler therefore sends only every n-th marker, with n chosen
so the rate stays ≤ pi6_max_rate_hz. The emitted sector is always an exact
marker, so the geometry is unaffected; only the correction cadence changes.

BioChain alignment: the 12 sectors are the same 12 π/6 sectors as
protocol/pump_clock.py (N=720 frames, 60 per sector). pump_token() returns
the "PUMP.<cycle>.<sector>" prefix of BioChain's logical-time token, which
lets the bridge stamp cocoon events onto the BioChain pump timeline.
"""
import math

TWO_PI = 2.0 * math.pi
SECTORS = 12


class MasterClock:
    def __init__(self, fe=10.0):
        self.fe = fe
        self._target = fe
        self._rate = 0.0          # Hz per second during a glide
        self._remaining = 0.0     # seconds of glide left
        self.turns = 0.0          # unwrapped phase in turns (cycle count + fraction)
        self.t = None

    def set_frequency(self, fe, ramp_ms):
        self._target = fe
        if ramp_ms <= 0:
            self.fe, self._rate, self._remaining = fe, 0.0, 0.0
        else:
            self._remaining = ramp_ms / 1000.0
            self._rate = (fe - self.fe) / self._remaining

    def advance(self, now):
        """Integrate phase to `now` (seconds). Returns the list of π/6 markers
        crossed as (cycle, sector) tuples, in order."""
        if self.t is None:
            self.t = now
            return []
        dt = max(0.0, now - self.t)
        self.t = now
        before = self.turns
        # Exact integration: linear glide segment (trapezoid) then constant segment.
        if self._remaining > 0:
            g = min(dt, self._remaining)
            f1 = self.fe + self._rate * g
            self.turns += 0.5 * (self.fe + f1) * g
            self._remaining -= g
            self.fe = self._target if self._remaining <= 1e-12 else f1
            if self._remaining <= 1e-12:
                self._remaining, self._rate = 0.0, 0.0
            dt -= g
        self.turns += self.fe * dt
        first = math.floor(before * SECTORS) + 1
        last = math.floor(self.turns * SECTORS)
        return [divmod(m, SECTORS) for m in range(first, last + 1)]

    @property
    def phase_rad(self):
        return (self.turns % 1.0) * TWO_PI

    @property
    def cycle(self):
        return int(self.turns)


class Pi6Scheduler:
    def __init__(self, clock, max_rate_hz=12.0):
        self.clock = clock
        self.max_rate_hz = max_rate_hz
        self._count = 0

    def stride(self):
        markers_per_s = SECTORS * max(self.clock.fe, 1e-6)
        return max(1, math.ceil(markers_per_s / self.max_rate_hz))

    def due(self, now):
        """Advance the clock; return the (cycle, sector) markers to broadcast."""
        out = []
        n = self.stride()
        for cycle, sector in self.clock.advance(now):
            self._count += 1
            if self._count % n == 0:
                out.append((cycle, sector))
        return out


def marker_phase(sector):
    return sector * math.pi / 6.0


def pump_token(cycle, sector):
    return "PUMP.%d.%d" % (cycle, sector)
