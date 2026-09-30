"""
The Guide: closed-loop policy from BioState to geometric commands.

Strategy (pace, then lead):
  1. PACE: open the session near the user's current dominant band, so the
     entrainment starts where the nervous system already is.
  2. LEAD: every decision interval, step the entrainment frequency toward the
     target band. The step size is proportional to the hyperbolic distance
     between the user's state quaternion and the target quaternion, clamped
     to a gentle range.
  3. RESISTANCE: if the distance has not improved over `patience` decisions,
     stop leading (hold fe) and escalate support one rung at a time:
        rung 1  haptic bilateral pacing (slow alternation)
        rung 2  650 nm light pulse at fe (only with photosensitive consent)
        rung 3  scalar coil burst envelope at fe, focused on the most resistant zone
     Once progress resumes, de-escalate one rung per decision.
  4. STRESS: calm < 0.35 moves the carrier to the 396 Hz root (the spec's
     workflow) with the spec's 15 s glide. Otherwise use a zone carrier when
     a zone is in focus, else 432 Hz.
  5. ARRIVAL: within `arrive_distance` of the target, hold and de-escalate.

Every command carries a human-readable `rationale`. The practitioner UI
shows it, and the session log stores it, so no decision is opaque.

Deterministic: identical inputs always produce identical commands (the
session tests and the BioChain receipt both rely on this).
"""
from dataclasses import dataclass, field, asdict

from .bands import BANDS, CALM_CARRIER, GROUNDING_CARRIER, band_of
from .hyperbolic import hyperbolic_distance, state_quaternion, target_quaternion
from .zones import ZoneMapper

HAPTIC_PACING_HZ = {"delta": 0.5, "theta": 0.7, "alpha": 1.0, "beta": 1.2, "gamma": 1.2}


@dataclass
class GeoCommand:
    fc: float
    fe: float
    amp: float
    modality: list
    mode: str = "isochronic"
    ramp_ms: int = 8000
    pan: float = 0.0
    pos: tuple = None                 # focus coordinate for the spatial panner
    photosensitive_consent: bool = False
    rationale: str = ""

    def to_update_geo(self):
        """JSON form per protocols/schemas/shd-ccp_update_geo.schema.json."""
        d = {"cmd": "update_geo", "fc": round(self.fc, 3), "fe": round(self.fe, 3),
             "amp": round(self.amp, 3), "pan": self.pan, "ramp_ms": int(self.ramp_ms),
             "mode": self.mode, "modality": list(self.modality),
             "photosensitive_consent": self.photosensitive_consent}
        if self.pos is not None:
            d["pos"] = list(self.pos)
        return d

    def as_dict(self):
        return asdict(self)


class GuidePolicy:
    """Interface. Any policy (rule-based, learned, or remote) implements this."""

    name = "abstract"

    def reset(self, target_band, *, audio_mode="isochronic", photosensitive_consent=False,
              modalities=("audio", "photonic", "haptic", "coil")):
        raise NotImplementedError

    def step(self, state, now, zone_resistance=None):
        """Return a list of GeoCommand (possibly empty = hold)."""
        raise NotImplementedError


@dataclass
class GuideConfig:
    decision_interval_s: float = 10.0
    patience: int = 3                 # decisions without progress → resistance
    progress_epsilon: float = 0.01    # hyperbolic distance units
    arrive_distance: float = 0.15
    gain_hz_per_unit: float = 3.0     # fe step = gain × distance, clamped
    min_step_hz: float = 0.25
    max_step_hz: float = 1.5
    carrier_ramp_ms: int = 15000      # spec: 15 s carrier glide
    fe_ramp_ms: int = 8000
    audio_amp: float = 0.35
    max_rung: int = 3


@dataclass
class _Internal:
    fe: float = None
    fc: float = CALM_CARRIER
    rung: int = 0
    stall: int = 0
    history: list = field(default_factory=list)
    last_decision: float = None


class RuleGuide(GuidePolicy):
    name = "rule_guide/1"

    def __init__(self, config=None):
        self.cfg = config or GuideConfig()
        self.zones = ZoneMapper()
        self.target = "alpha"
        self.audio_mode = "isochronic"
        self.consent = False
        self.modalities = ("audio",)
        self.s = _Internal()

    def reset(self, target_band, *, audio_mode="isochronic", photosensitive_consent=False,
              modalities=("audio", "photonic", "haptic", "coil")):
        if target_band not in BANDS:
            raise ValueError("unknown target band %r" % target_band)
        self.target = target_band
        self.audio_mode = audio_mode
        self.consent = bool(photosensitive_consent)
        self.modalities = tuple(modalities)
        self.zones = ZoneMapper()
        self.s = _Internal()

    # -- helpers ---------------------------------------------------------
    def distance(self, state):
        return hyperbolic_distance(state_quaternion(state), target_quaternion(self.target))

    def _progress(self, d):
        """'unknown' until the window holds `patience` decisions, then 'progress' or 'stall'."""
        h = self.s.history
        h.append(d)
        if len(h) > self.cfg.patience + 1:
            h.pop(0)
        if len(h) <= self.cfg.patience:
            return "unknown"
        return "progress" if (h[0] - h[-1]) > self.cfg.progress_epsilon else "stall"

    # -- policy ----------------------------------------------------------
    def step(self, state, now, zone_resistance=None):
        cfg, s = self.cfg, self.s
        if s.last_decision is not None and now - s.last_decision < cfg.decision_interval_s:
            return []
        s.last_decision = now

        target_fe = BANDS[self.target][2]
        d = self.distance(state)
        focus = self.zones.update(zone_resistance or {})
        why = []

        # 1. pace: the first decision only meets the user where they are
        if s.fe is None:
            s.fe = BANDS[state.dominant][2]
            why.append("pacing at the user's dominant %s band (%.2f Hz)" % (state.dominant, s.fe))
            s.history = [d]
            status = "paced"
        else:
            status = self._progress(d)

        arrived = d <= cfg.arrive_distance and band_of(s.fe) == self.target
        lead = status == "progress" or (status == "unknown" and s.rung == 0)
        # 2/3. lead, hold, or escalate
        if status == "paced":
            pass
        elif arrived:
            s.stall = 0
            if s.rung:
                s.rung -= 1
            why.append("at target (d_H=%.3f); holding %.2f Hz" % (d, s.fe))
        elif lead:
            s.stall = 0
            if status == "progress" and s.rung:
                s.rung -= 1
                why.append("progress resumed; de-escalating to rung %d" % s.rung)
            step = max(cfg.min_step_hz, min(cfg.max_step_hz, cfg.gain_hz_per_unit * d))
            if abs(target_fe - s.fe) <= step:
                s.fe = target_fe
            else:
                s.fe += step if target_fe > s.fe else -step
            why.append("leading toward %s: fe → %.2f Hz (d_H=%.3f)" % (self.target, s.fe, d))
        elif status == "unknown":
            why.append("holding %.2f Hz at support rung %d while the response settles (d_H=%.3f)"
                       % (s.fe, s.rung, d))
        else:
            s.stall += 1
            if s.rung < cfg.max_rung:
                s.rung += 1
            why.append("resistance: no progress over %d decisions (d_H=%.3f); holding %.2f Hz, support rung %d"
                       % (cfg.patience, d, s.fe, s.rung))
            s.history = s.history[-1:]            # restart the progress window

        # 4. carrier
        if state.calm < 0.35:
            fc, fc_why = GROUNDING_CARRIER, "high stress (calm=%.2f) → 396 Hz root carrier" % state.calm
        elif focus:
            fc, fc_why = ZoneMapper.carrier(focus), "zone focus %s → %.0f Hz" % (focus, ZoneMapper.carrier(focus))
        else:
            fc, fc_why = CALM_CARRIER, None
        carrier_changed = fc != s.fc
        if carrier_changed:
            why.append(fc_why or "returning to 432 Hz carrier")
        s.fc = fc
        ramp = cfg.carrier_ramp_ms if carrier_changed else cfg.fe_ramp_ms

        rationale = "; ".join(why)
        depth_trim = 0.1 * max(0.0, (BANDS["alpha"][2] - s.fe) / BANDS["alpha"][2])
        cmds = []
        if "audio" in self.modalities:
            cmds.append(GeoCommand(fc=fc, fe=s.fe, amp=cfg.audio_amp - depth_trim, modality=["audio"],
                                   mode=self.audio_mode, ramp_ms=ramp, rationale=rationale))
        on = lambda rung, m: s.rung >= rung and m in self.modalities  # noqa: E731
        cmds.append(GeoCommand(fc=fc, fe=HAPTIC_PACING_HZ[self.target], amp=0.35 if on(1, "haptic") else 0.0,
                               modality=["haptic"], mode="bilateral", ramp_ms=5000, rationale=rationale)) \
            if "haptic" in self.modalities else None
        if "photonic" in self.modalities:
            lit = on(2, "photonic") and self.consent
            cmds.append(GeoCommand(fc=fc, fe=s.fe, amp=0.3 if lit else 0.0, modality=["photonic"], mode="pulse",
                                   ramp_ms=5000, photosensitive_consent=self.consent,
                                   rationale=rationale + ("" if lit or not on(2, "photonic")
                                                          else "; light skipped (no photosensitive consent)")))
        if "coil" in self.modalities:
            pos = ZoneMapper.coordinate(focus) if focus else None
            cmds.append(GeoCommand(fc=fc, fe=s.fe, amp=0.25 if on(3, "coil") else 0.0, modality=["coil"],
                                   mode="pulse", ramp_ms=5000, pos=pos, rationale=rationale))
        return cmds

    def snapshot(self):
        return {"policy": self.name, "target": self.target, "fe": self.s.fe, "fc": self.s.fc,
                "rung": self.s.rung, "stall": self.s.stall, "focus": self.zones.focus}
