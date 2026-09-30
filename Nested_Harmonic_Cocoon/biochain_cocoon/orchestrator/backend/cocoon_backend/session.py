"""
SessionEngine: the orchestrator's control loop.

Every tick (default 50 Hz):
  1. drain the mesh: Announce/Telemetry → registry
  2. advance the pi6 master clocks and broadcast due markers
  3. heartbeat, so pucks keep their watchdog fed between commands
  4. if a guided session is running, ask the Guide for its next decision
     (the Guide rate-limits itself) and dispatch the commands

Two clock groups (see firmware packet_router.cpp):
  macro  = audio | photonic | coil, sharing the entrainment frequency
  haptic = bilateral pacing, which runs at its own slower rate
"""
import threading
import time

from cocoon_ai import BiostateEstimator, RuleGuide
from cocoon_ai.bands import BANDS

from . import shdccp, spatial
from .pi6 import MasterClock, Pi6Scheduler, pump_token
from .shdccp import CMD, MODALITY, Packet

import validate as schema  # protocols/validate.py (path set in package __init__)

GROUPS = {"macro": MODALITY["audio"] | MODALITY["photonic"] | MODALITY["coil"], "haptic": MODALITY["haptic"]}
MANUAL_HOLD_S = 30.0
MAX_SESSION_S = 90 * 60          # mirrors SafetyLimits::maxSessionMs on the pucks


def group_of(modality_names):
    return "haptic" if modality_names == ["haptic"] else "macro"


class SessionEngine:
    def __init__(self, cfg, transport, store, registry, bridge_enabled=False, clock=time.monotonic, wall=time.time):
        self.cfg = cfg
        self.tx = transport
        self.store = store
        self.registry = registry
        self.clock = clock
        self.wall = wall
        self.lock = threading.RLock()
        self._seq = 0                          # first packet goes out with seq 0: the restart marker
        self.clocks = {g: MasterClock(10.0 if g == "macro" else 1.0) for g in GROUPS}
        self.pi6 = {g: Pi6Scheduler(c, cfg.pi6_max_rate_hz) for g, c in self.clocks.items()}
        self._last_heartbeat = 0.0
        self.session = None
        self.guide = None
        self.estimator = None
        self.recorder = None
        self.bridge_enabled = bridge_enabled
        self.manual_until = 0.0
        self.last_commands = {}
        self.stats = {"sent": 0, "received": 0, "rejected": 0, "pi6": 0}

    # -- packets ----------------------------------------------------------
    def _next_seq(self):
        s = self._seq
        self._seq = (self._seq + 1) & 0xFFFF or 1  # never re-send 0 after startup
        return s

    def _send(self, pkt):
        pkt.seq = self._next_seq()
        self.tx.send(pkt.encode())
        self.stats["sent"] += 1
        if self.recorder:
            self.recorder.record_packet(pkt)

    def send_update_geo(self, cmd_json, source="guide"):
        """Validate, fan out spatially, update the master clock, send. Returns packets sent."""
        errs = schema.validate("shd-ccp_update_geo.schema.json", cmd_json)
        if errs:
            raise ValueError("; ".join(errs))
        mods = cmd_json.get("modality") or list(MODALITY)
        now = self.clock()
        with self.lock:
            grp = group_of(mods)
            self.clocks[grp].set_frequency(cmd_json["fe"], cmd_json.get("ramp_ms", 5000))
            nodes = []
            for m in mods:
                nodes += self.registry.by_modality(m, self.wall())
            sent = 0
            for node, d in spatial.fan_out(cmd_json, nodes):
                self._send(shdccp.from_update_geo(d, node=shdccp.BROADCAST if node is None else node))
                sent += 1
            for m in mods:
                self.last_commands[m] = dict(cmd_json, source=source, t=self.wall())
            if self.session:
                self.store.log(self.session["id"], "command", dict(cmd_json, source=source))
        return sent

    def play_preset(self, preset_id):
        with self.lock:
            self._send(Packet(cmd=CMD["play_preset"], aux=int(preset_id)))
            if self.session:
                self.store.log(self.session["id"], "command", {"cmd": "play_preset", "id": preset_id})

    def stop_all(self, fade_ms=5000):
        with self.lock:
            self._send(Packet(cmd=CMD["stop"], ramp_ms=fade_ms))

    # -- sessions ---------------------------------------------------------
    def start(self, target_band, profile_id=None, audio_mode="isochronic", photosensitive_consent=False,
              modalities=("audio", "photonic", "haptic", "coil"), preset_id=None, owner_uid=None):
        if target_band not in BANDS:
            raise ValueError("unknown target band")
        with self.lock:
            if self.session:
                self.stop()
            if photosensitive_consent and profile_id:
                p = self.store.profile(profile_id)
                if not p or not p.get("photosensitive_consent"):
                    raise PermissionError("profile has not recorded photosensitive consent")
            config = {"audio_mode": audio_mode, "photosensitive_consent": photosensitive_consent,
                      "modalities": list(modalities)}
            self.guide = RuleGuide()
            self.guide.reset(target_band, audio_mode=audio_mode, photosensitive_consent=photosensitive_consent,
                             modalities=modalities)
            self.estimator = BiostateEstimator()
            sid = self.store.start_session(profile_id, target_band, preset_id, self.guide.name, config, owner_uid)
            self.session = {"id": sid, "target": target_band, "started": self.wall(), "preset_id": preset_id,
                            "profile_id": profile_id, "owner_uid": owner_uid, **config}
            if self.bridge_enabled:
                from .biochain_bridge import SessionRecorder
                self.recorder = SessionRecorder(sid, self.session["started"], preset_id,
                                                self.cfg.biochain_protocol_path)
                self.recorder.target = target_band
            self.store.log(sid, "note", {"msg": "session started", **self.session})
            if preset_id is not None:
                self.play_preset(preset_id)
            return dict(self.session)

    def stop(self, fade_ms=8000):
        with self.lock:
            if not self.session:
                return None
            self.stop_all(fade_ms)
            sid = self.session["id"]
            self.store.end_session(sid)
            self.store.log(sid, "note", {"msg": "session stopped"})
            out = {"session_id": sid}
            if self.recorder:
                receipt, extra = self.recorder.receipt(self.wall())
                self.store.save_receipt(sid, {"receipt": receipt, **extra})
                out["receipt"] = receipt
            self.session = self.guide = self.estimator = self.recorder = None
            return out

    def ingest_biofeedback(self, frame):
        errs = schema.validate("biofeedback_frame.schema.json", frame)
        if errs:
            raise ValueError("; ".join(errs))
        with self.lock:
            if not self.session:
                return None
            self.store.add_biofeedback(self.session["id"], frame)
            if self.recorder:
                self.recorder.record_biofeedback(frame)
            return self.estimator.update(frame).as_dict()

    def manual_command(self, cmd_json):
        """Practitioner override: sends immediately and pauses the Guide for MANUAL_HOLD_S."""
        n = self.send_update_geo(cmd_json, source="manual")
        self.manual_until = self.clock() + MANUAL_HOLD_S
        return n

    # -- loop -------------------------------------------------------------
    def _drain(self):
        now = self.wall()
        for frame in self.tx.recv():
            try:
                p = Packet.decode(frame)
            except ValueError:
                self.stats["rejected"] += 1
                continue
            self.stats["received"] += 1
            if p.cmd in (CMD["announce"], CMD["telemetry"]):
                self.registry.on_announce(p, now)

    def tick(self):
        now = self.clock()
        with self.lock:
            self._drain()
            for g, sched in self.pi6.items():
                for cycle, sector in sched.due(now):
                    # phase = master phase *at transmission*. The tick loop notices a
                    # marker up to one tick late, and sending the bare marker angle
                    # would pull every puck back by that lateness. aux still names
                    # the π/6 sector crossed (pump-clock mapping).
                    pkt = Packet(cmd=CMD["pi6"], modality=GROUPS[g], phase=self.clocks[g].phase_rad,
                                 fe=self.clocks[g].fe, ramp_ms=self.cfg.pi6_slew_ms, aux=sector)
                    self._send(pkt)
                    self.stats["pi6"] += 1
                    if self.recorder and g == "macro":
                        self.recorder.record_pi6(cycle, sector)
            if now - self._last_heartbeat >= self.cfg.heartbeat_s:
                self._last_heartbeat = now
                self._send(Packet(cmd=CMD["heartbeat"]))
            if self.session and self.wall() - self.session["started"] > MAX_SESSION_S:
                self.store.log(self.session["id"], "note", {"msg": "90 min ceiling reached; fading out"})
                self.stop()
            if self.session and self.guide and now >= self.manual_until:
                state = self.estimator.state
                cmds = self.guide.step(state, now, self.estimator.zone_resistance())
                if cmds:
                    d = self.guide.distance(state)
                    if self.recorder:
                        self.recorder.record_distance(d)
                    self.store.log(self.session["id"], "guide", {**self.guide.snapshot(), "distance": d,
                                                                 "rationale": cmds[0].rationale,
                                                                 "state": state.as_dict()})
                    for c in cmds:
                        self.send_update_geo(c.to_update_geo(), source="guide")

    def status(self):
        with self.lock:
            macro = self.clocks["macro"]
            return {
                "session": self.session,
                "guide": self.guide.snapshot() if self.guide else None,
                "biostate": self.estimator.state.as_dict() if self.estimator else None,
                "clock": {"fe": round(macro.fe, 4), "phase_rad": round(macro.phase_rad, 4),
                          "pump": pump_token(macro.cycle, int(macro.phase_rad // (3.141592653589793 / 6)) % 12)},
                "manual_hold_s": max(0.0, round(self.manual_until - self.clock(), 1)),
                "last_commands": self.last_commands,
                "stats": dict(self.stats),
                "bridge": self.bridge_enabled,
            }

    def run_forever(self, stop_event):
        period = 1.0 / self.cfg.tick_hz
        while not stop_event.is_set():
            t0 = time.monotonic()
            try:
                self.tick()
            except Exception as e:  # keep the loop alive; surface in logs
                print("[cocoon] tick error:", repr(e))
            stop_event.wait(max(0.0, period - (time.monotonic() - t0)))
