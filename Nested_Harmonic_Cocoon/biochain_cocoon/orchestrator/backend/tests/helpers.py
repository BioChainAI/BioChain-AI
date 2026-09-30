import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import cocoon_backend  # noqa: E402,F401  (sets ai_core/protocols paths)
from cocoon_backend.config import Config  # noqa: E402
from cocoon_backend.mesh import LoopbackBus  # noqa: E402
from cocoon_backend.registry import NodeRegistry  # noqa: E402
from cocoon_backend.session import SessionEngine  # noqa: E402
from cocoon_backend.sim import VirtualPuck, default_layout  # noqa: E402
from cocoon_backend.store import Store  # noqa: E402


class FakeClock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


def rig(bridge=False, drift=True):
    """Engine + loopback bus + the default six virtual pucks, on a fake clock."""
    cfg = Config()
    cfg.transport = "loopback"
    clk = FakeClock()
    wall = FakeClock(1.7e9)
    bus = LoopbackBus()
    tx = bus.endpoint()
    store = Store(":memory:")
    reg = NodeRegistry(store)
    pucks = []
    for n, t, pos in default_layout():
        reg.set_position(n, pos)
        pucks.append(VirtualPuck(bus.endpoint(), n, t, drift_ppm=((n * 37) % 90 - 45) * 20 if drift else 0))
    eng = SessionEngine(cfg, tx, store, reg, bridge_enabled=bridge, clock=clk, wall=wall)
    return eng, pucks, clk, wall, store, reg


def run(eng, pucks, clk, wall, seconds, dt=0.01, announce_every=2.0, on_step=None):
    steps = int(seconds / dt)
    next_announce = 0.0
    for i in range(steps):
        clk.t += dt
        wall.t += dt
        for p in pucks:
            p.step(dt)
        if i * dt >= next_announce:
            next_announce += announce_every
            for p in pucks:
                p.announce()
        eng.tick()
        if on_step:
            on_step(i * dt)
