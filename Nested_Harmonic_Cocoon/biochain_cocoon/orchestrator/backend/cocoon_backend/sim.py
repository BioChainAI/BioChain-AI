"""
Hardware-free simulation: virtual pucks on a LoopbackBus and a synthetic user.

VirtualPuck mirrors the firmware NodeRuntime + EntrainmentClock behaviour
(boot standalone, go connected on first packet, per-modality pi6 slew, never
jump) and runs a crystal drift of ±ppm, so the pi6 correction does real work.
SyntheticUser is a toy physiology: its dominant EEG frequency is drawn toward
the delivered entrainment frequency with a time constant and a configurable
"resistance". It emits biofeedback frames in the schema format.

Used by `python -m cocoon_backend --sim`, the frontend demo, and the tests.
It is not a physiological model and makes no claims about real users.
"""
import math
import random

from .shdccp import CMD, MODALITY, Packet

MODALITY_OF_TYPE = {1: MODALITY["audio"], 2: MODALITY["photonic"], 3: MODALITY["haptic"], 4: MODALITY["coil"]}


class VirtualPuck:
    def __init__(self, endpoint, node, node_type, drift_ppm=0.0, fe=10.0):
        self.ep = endpoint
        self.node = node
        self.type = node_type
        self.modality = MODALITY_OF_TYPE[node_type]
        self.drift = 1.0 + drift_ppm * 1e-6
        self.fe = fe
        self.fe_target = fe
        self.fe_rate = 0.0
        self.amp = 0.0
        self.turns = 0.0
        self.slew_left = 0.0
        self.slew_rate = 0.0
        self.last_err = 0.0
        self.connected = False
        self.seq = 1
        self.received = 0

    def _handle(self, p):
        if p.node not in (0xFFFF, self.node):
            return
        if p.cmd in (CMD["update_geo"], CMD["pi6"]) and not (p.modality & self.modality):
            return
        self.connected = True
        self.received += 1
        if p.cmd == CMD["update_geo"]:
            ramp = max(p.ramp_ms, 250) / 1000.0
            self.fe_target = p.fe
            self.fe_rate = (p.fe - self.fe) / ramp
            self.amp = p.amp
        elif p.cmd == CMD["pi6"]:
            target = (p.phase / (2 * math.pi)) % 1.0
            err = (target - self.turns % 1.0 + 0.5) % 1.0 - 0.5
            window = max(p.ramp_ms, 1) / 1000.0
            self.slew_rate = err / window
            self.slew_left = window
            self.last_err = err * 2 * math.pi

    def step(self, dt):
        for frame in self.ep.recv():
            try:
                self._handle(Packet.decode(frame))
            except ValueError:
                pass
        if self.fe_rate:
            self.fe += self.fe_rate * dt
            if (self.fe_rate > 0 and self.fe >= self.fe_target) or (self.fe_rate < 0 and self.fe <= self.fe_target):
                self.fe, self.fe_rate = self.fe_target, 0.0
        inc = self.fe * self.drift * dt
        if self.slew_left > 0:
            s = min(dt, self.slew_left)
            inc += self.slew_rate * s
            self.slew_left -= s
        self.turns += inc

    def announce(self):
        p = Packet(cmd=CMD["announce"], node=self.node, modality=self.modality, aux=self.type,
                   phase=self.last_err, amp=31.0, flags=0 if self.connected else 2, seq=self.seq)
        self.seq += 1
        self.ep.send(p.encode())

    @property
    def phase_turns(self):
        return self.turns % 1.0


class SyntheticUser:
    def __init__(self, start_hz=18.0, tau_s=90.0, resistance=0.0, seed=7):
        self.f = start_hz            # current dominant brain rhythm (Hz)
        self.tau = tau_s
        self.resistance = resistance  # 0 = follows, 1 = ignores entrainment
        self.rng = random.Random(seed)
        self.t = 0.0

    def step(self, dt, entrain_hz, support=0.0):
        """support: 0..1 extra drive from haptic/light/coil (reduces resistance)."""
        follow = (1.0 - self.resistance * (1.0 - 0.6 * support)) / self.tau
        self.f += (entrain_hz - self.f) * follow * dt
        self.t += dt

    def frame(self, t):
        calm = max(0.0, min(1.0, 1.0 - (self.f - 2.0) / 25.0))
        rmssd = 15.0 + 70.0 * calm
        rr = []
        base = 1000.0 - 250.0 * (1.0 - calm)
        for i in range(6):
            rr.append(base + (rmssd / math.sqrt(2)) * (1 if i % 2 else -1) + self.rng.gauss(0, 2))
        centres = {"delta": 2.0, "theta": 6.0, "alpha": 10.0, "beta": 18.0, "gamma": 38.0}
        eeg = {b: round(math.exp(-((math.log(self.f) - math.log(c)) ** 2) / 0.18) + 0.02, 5) for b, c in centres.items()}
        return {"t": t, "source": "sim", "rr_ms": [round(x, 1) for x in rr], "hr_bpm": round(60000.0 / base, 1),
                "eeg_bands": eeg, "gsr_us": round(2.0 + 6.0 * (1.0 - calm) + self.rng.gauss(0, 0.05), 3)}


def default_layout():
    """Six pucks around a reclining user (metres; +y toward the head)."""
    return [
        (1, 1, (-0.6, 0.6, 0.3)), (2, 1, (0.6, 0.6, 0.3)), (3, 1, (0.0, -0.9, 0.3)),
        (101, 2, (0.0, 0.9, 0.5)),
        (201, 3, (-0.35, 0.0, 0.0)),
        (301, 4, (0.0, 0.0, -0.1)),
    ]
