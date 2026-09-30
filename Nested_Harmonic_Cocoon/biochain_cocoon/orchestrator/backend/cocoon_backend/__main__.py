"""
Run the orchestrator:

    python3 -m cocoon_backend                # real mesh (UDP by default)
    python3 -m cocoon_backend --sim          # virtual pucks + synthetic user, no hardware
    COCOON_BIOCHAIN_BRIDGE=1 python3 -m cocoon_backend --sim   # + BioChain receipts

Then open http://127.0.0.1:8640/
"""
import argparse
import threading
import time

from .api import App, serve
from .config import Config
from .mesh import LoopbackBus, make_transport
from .registry import NodeRegistry
from .session import SessionEngine
from .store import Store


def main():
    ap = argparse.ArgumentParser(prog="cocoon_backend")
    ap.add_argument("--sim", action="store_true", help="simulate pucks and a user (no hardware)")
    ap.add_argument("--host")
    ap.add_argument("--port", type=int)
    ap.add_argument("--db")
    a = ap.parse_args()

    cfg = Config()
    if a.host:
        cfg.http_host = a.host
    if a.port:
        cfg.http_port = a.port
    if a.db:
        cfg.db_path = a.db
    if a.sim:
        cfg.transport = "loopback"
        cfg.db_path = a.db or ":memory:"

    store = Store(cfg.db_path)
    registry = NodeRegistry(store)
    stop = threading.Event()

    if a.sim:
        from .sim import SyntheticUser, VirtualPuck, default_layout
        bus = LoopbackBus()
        tx = bus.endpoint()
        pucks = [VirtualPuck(bus.endpoint(), n, t, drift_ppm=(n * 37) % 90 - 45) for n, t, _ in default_layout()]
        for n, _, pos in default_layout():
            registry.set_position(n, pos)
        user = SyntheticUser(resistance=0.4)
    else:
        tx = make_transport(cfg)

    engine = SessionEngine(cfg, tx, store, registry, bridge_enabled=cfg.biochain_bridge)
    app = App(cfg, engine, store, registry)
    httpd = serve(app, cfg.http_host, cfg.http_port)
    threading.Thread(target=engine.run_forever, args=(stop,), daemon=True).start()
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print("[cocoon] orchestrator on http://%s:%d/ (transport=%s, bridge=%s)" %
          (cfg.http_host, cfg.http_port, cfg.transport, "on" if cfg.biochain_bridge else "off"))

    try:
        if a.sim:
            last_announce = last_frame = 0.0
            t_prev = time.monotonic()
            while True:
                now = time.monotonic()
                dt, t_prev = now - t_prev, now
                for p in pucks:
                    p.step(dt)
                if now - last_announce > 2.0:
                    last_announce = now
                    for p in pucks:
                        p.announce()
                audio = next((p for p in pucks if p.type == 1), None)
                g = engine.guide
                user.step(dt, audio.fe if audio and audio.connected else user.f,
                          support=(g.s.rung / 3.0) if g else 0.0)
                if engine.session and now - last_frame > 1.0:
                    last_frame = now
                    engine.ingest_biofeedback(user.frame(time.time()))
                time.sleep(0.01)
        else:
            while True:
                time.sleep(3600)
                store.apply_retention()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        engine.stop()
        httpd.shutdown()


if __name__ == "__main__":
    main()
