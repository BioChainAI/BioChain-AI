"""
Biofeedback → BioState.

Inputs are frames shaped like protocols/schemas/biofeedback_frame.schema.json.
Every channel is optional: the estimator reports what it can and records
which channels contributed (`sources`), so the guide never acts on data it
does not have.

Metrics:
  • HRV: RMSSD over a rolling RR window. Higher RMSSD reads as more
    parasympathetic, i.e. calmer. Mapped to `calm` in [0, 1] with a
    log-scale around typical adult resting values (20–100 ms).
  • EEG: relative band power, normalised; `dominant` band and a 5-vector.
  • GSR: skin conductance level versus the session baseline; rising = arousal.
"""
import math
from collections import deque
from dataclasses import dataclass, field

from .bands import BAND_ORDER


@dataclass
class BioState:
    t: float = 0.0
    calm: float = 0.5            # 0 = highly stressed … 1 = deeply relaxed
    arousal: float = 0.5         # 0 = drowsy … 1 = activated
    bands: dict = field(default_factory=lambda: {b: 0.2 for b in BAND_ORDER})
    dominant: str = "alpha"
    rmssd_ms: float = None
    hr_bpm: float = None
    gsr_us: float = None
    zone_gsr: dict = field(default_factory=dict)
    sources: tuple = ()

    @property
    def depth(self):
        """0 = gamma/beta-dominant … 1 = delta-dominant (weighted band centroid)."""
        w = sum(self.bands.values()) or 1.0
        centroid = sum(i * self.bands[b] for i, b in enumerate(BAND_ORDER)) / w
        return 1.0 - centroid / (len(BAND_ORDER) - 1)

    def as_dict(self):
        return {
            "t": self.t, "calm": round(self.calm, 4), "arousal": round(self.arousal, 4),
            "depth": round(self.depth, 4), "dominant": self.dominant,
            "bands": {k: round(v, 4) for k, v in self.bands.items()},
            "rmssd_ms": self.rmssd_ms, "hr_bpm": self.hr_bpm, "gsr_us": self.gsr_us,
            "zone_gsr": self.zone_gsr, "sources": list(self.sources),
        }


def rmssd(rr):
    if len(rr) < 3:
        return None
    d = [(b - a) ** 2 for a, b in zip(rr, list(rr)[1:])]
    return math.sqrt(sum(d) / len(d))


def _squash(x, lo, hi):
    """Log-scale map of x into [0, 1] between lo and hi."""
    if x is None or x <= 0:
        return None
    v = (math.log(x) - math.log(lo)) / (math.log(hi) - math.log(lo))
    return max(0.0, min(1.0, v))


class BiostateEstimator:
    def __init__(self, rr_window=64, eeg_alpha=0.3, gsr_alpha=0.2):
        self.rr = deque(maxlen=rr_window)
        self.eeg_alpha = eeg_alpha
        self.gsr_alpha = gsr_alpha
        self.state = BioState()
        self._gsr_baseline = None
        self._zone_baseline = {}

    def update(self, frame):
        s = self.state
        s.t = frame.get("t", s.t)
        sources = []

        for x in frame.get("rr_ms", []) or []:
            self.rr.append(float(x))
        r = rmssd(self.rr)
        if r is not None:
            s.rmssd_ms = r
            sources.append("hrv")
        if frame.get("hr_bpm") is not None:
            s.hr_bpm = float(frame["hr_bpm"])
            sources.append("hr")

        eeg = frame.get("eeg_bands")
        if eeg:
            total = sum(eeg.get(b, 0.0) for b in BAND_ORDER) or 1.0
            for b in BAND_ORDER:
                rel = eeg.get(b, 0.0) / total
                s.bands[b] = (1 - self.eeg_alpha) * s.bands[b] + self.eeg_alpha * rel
            s.dominant = max(BAND_ORDER, key=lambda b: s.bands[b])
            sources.append("eeg")

        if frame.get("gsr_us") is not None:
            g = float(frame["gsr_us"])
            s.gsr_us = g if s.gsr_us is None else (1 - self.gsr_alpha) * s.gsr_us + self.gsr_alpha * g
            if self._gsr_baseline is None:
                self._gsr_baseline = g
            sources.append("gsr")

        for zone, g in (frame.get("zone_gsr_us") or {}).items():
            prev = s.zone_gsr.get(zone)
            s.zone_gsr[zone] = g if prev is None else (1 - self.gsr_alpha) * prev + self.gsr_alpha * g
            self._zone_baseline.setdefault(zone, g)
        if frame.get("zone_gsr_us"):
            sources.append("zones")

        # --- fuse into calm / arousal -------------------------------------
        calm_votes, arousal_votes = [], []
        c = _squash(s.rmssd_ms, 20.0, 100.0)
        if c is not None:
            calm_votes.append(c)
        if s.hr_bpm is not None:
            arousal_votes.append(max(0.0, min(1.0, (s.hr_bpm - 55.0) / 50.0)))
        if eeg:
            arousal_votes.append(1.0 - s.depth)
        if s.gsr_us is not None and self._gsr_baseline:
            rel = s.gsr_us / self._gsr_baseline            # 1.0 = baseline
            arousal_votes.append(max(0.0, min(1.0, 0.5 + (rel - 1.0) * 2.0)))
        if calm_votes:
            s.calm = sum(calm_votes) / len(calm_votes)
        if arousal_votes:
            s.arousal = sum(arousal_votes) / len(arousal_votes)
        if not calm_votes and arousal_votes:
            s.calm = 1.0 - s.arousal
        s.sources = tuple(sorted(set(s.sources) | set(sources)))
        return s

    def zone_resistance(self):
        """Per-zone relative conductance rise over baseline (≥ 0). Higher = more 'resistance'."""
        out = {}
        for z, g in self.state.zone_gsr.items():
            b = self._zone_baseline.get(z) or g or 1.0
            out[z] = max(0.0, g / b - 1.0)
        return out
