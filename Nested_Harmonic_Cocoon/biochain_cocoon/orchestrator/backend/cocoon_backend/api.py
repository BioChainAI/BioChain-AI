"""
HTTP JSON API + static frontend. Standard library only (http.server).

Reference: docs/api_reference/orchestrator_api.md. Mutating endpoints
require `Authorization: Bearer <COCOON_API_TOKEN>` when a token is
configured. Bind to 127.0.0.1 (the default) unless the hub runs on a
trusted, isolated network.
"""
import glob
import json
import mimetypes
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from . import COCOON_ROOT, __version__

PRESET_DIR = os.path.join(COCOON_ROOT, "standalone_presets")


def load_presets():
    out = []
    for fn in sorted(glob.glob(os.path.join(PRESET_DIR, "*.json"))):
        with open(fn) as f:
            p = json.load(f)
        p.pop("$schema", None)
        out.append(p)
    return out


class App:
    def __init__(self, cfg, engine, store, registry):
        self.cfg, self.engine, self.store, self.registry = cfg, engine, store, registry
        self.presets = load_presets()
        self.routes = [
            ("GET", r"/api/status$", self.status),
            ("GET", r"/api/nodes$", self.nodes),
            ("PUT", r"/api/nodes/(\d+)/position$", self.set_position),
            ("GET", r"/api/presets$", lambda h, m, b, q: self.presets),
            ("POST", r"/api/presets/(\d+)/play$", self.play_preset),
            ("GET", r"/api/profiles$", lambda h, m, b, q: self.store.profiles()),
            ("POST", r"/api/profiles$", self.create_profile),
            ("PUT", r"/api/profiles/(\d+)/consent$", self.set_consent),
            ("POST", r"/api/session/start$", self.start),
            ("POST", r"/api/session/stop$", self.stop),
            ("GET", r"/api/sessions$", lambda h, m, b, q: self.store.sessions()),
            ("GET", r"/api/sessions/([0-9a-f]{32})/receipt$", self.receipt),
            ("POST", r"/api/command$", self.command),
            ("POST", r"/api/stop_all$", self.stop_all),
            ("POST", r"/api/biofeedback$", self.biofeedback),
            ("GET", r"/api/events$", self.events),
        ]

    # handlers: (handler, match, body, query) → JSON-able
    def status(self, h, m, b, q):
        return {"version": __version__, "time": time.time(), **self.engine.status(),
                "nodes_online": sum(1 for n in self.registry.nodes(time.time()) if n["online"])}

    def nodes(self, h, m, b, q):
        return self.registry.nodes(time.time())

    def set_position(self, h, m, b, q):
        pos = b.get("pos")
        if not (isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) for v in pos)):
            raise ValueError("pos must be [x, y, z] in metres")
        self.registry.set_position(int(m.group(1)), pos, b.get("label"))
        return {"ok": True}

    def play_preset(self, h, m, b, q):
        pid = int(m.group(1))
        if not any(p["id"] == pid for p in self.presets):
            raise KeyError("no such preset")
        self.engine.play_preset(pid)
        return {"ok": True}

    def create_profile(self, h, m, b, q):
        name = str(b.get("name", "")).strip()
        if not name:
            raise ValueError("name required")
        return {"id": self.store.create_profile(name, b.get("prefs"))}

    def set_consent(self, h, m, b, q):
        self.store.set_photosensitive_consent(int(m.group(1)), bool(b.get("photosensitive_consent")))
        return self.store.profile(int(m.group(1)))

    def start(self, h, m, b, q):
        return self.engine.start(b.get("target", "alpha"), profile_id=b.get("profile_id"),
                                 audio_mode=b.get("audio_mode", "isochronic"),
                                 photosensitive_consent=bool(b.get("photosensitive_consent")),
                                 modalities=tuple(b.get("modalities") or ("audio", "photonic", "haptic", "coil")),
                                 preset_id=b.get("preset_id"))

    def stop(self, h, m, b, q):
        return self.engine.stop(int(b.get("fade_ms", 8000))) or {"ok": True, "session": None}

    def receipt(self, h, m, b, q):
        r = self.store.receipt(m.group(1))
        if r is None:
            raise KeyError("no receipt (bridge disabled or session still running)")
        return r

    def command(self, h, m, b, q):
        return {"sent": self.engine.manual_command(b)}

    def stop_all(self, h, m, b, q):
        self.engine.stop_all(int(b.get("fade_ms", 3000)))
        return {"ok": True}

    def biofeedback(self, h, m, b, q):
        return {"biostate": self.engine.ingest_biofeedback(b)}

    def events(self, h, m, b, q):
        since = int(q.get("since", ["0"])[0])
        sid = q.get("session", [None])[0]
        return self.store.events(sid, since)


def make_handler(app):
    frontend = os.path.realpath(app.cfg.frontend_dir)

    class Handler(BaseHTTPRequestHandler):
        server_version = "cocoon/" + __version__

        def log_message(self, fmt, *args):  # quiet; the engine logs what matters
            pass

        def _json(self, code, obj):
            data = json.dumps(obj, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _authorised(self):
            tok = app.cfg.api_token
            return not tok or self.headers.get("Authorization", "") == "Bearer " + tok

        def _dispatch(self, method):
            url = urlparse(self.path)
            if not url.path.startswith("/api/"):
                return self._static(url.path) if method == "GET" else self._json(405, {"error": "method"})
            if method != "GET" and not self._authorised():
                return self._json(401, {"error": "unauthorised"})
            body = {}
            if method in ("POST", "PUT"):
                n = int(self.headers.get("Content-Length") or 0)
                if n > 65536:
                    return self._json(413, {"error": "body too large"})
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except json.JSONDecodeError:
                    return self._json(400, {"error": "invalid JSON"})
                if not isinstance(body, dict):
                    return self._json(400, {"error": "body must be an object"})
            for meth, pattern, fn in app.routes:
                mt = re.match(pattern, url.path)
                if mt and meth == method:
                    try:
                        return self._json(200, fn(self, mt, body, parse_qs(url.query)))
                    except PermissionError as e:
                        return self._json(403, {"error": str(e)})
                    except KeyError as e:
                        return self._json(404, {"error": str(e).strip("'")})
                    except (ValueError, TypeError) as e:
                        return self._json(400, {"error": str(e)})
            return self._json(404, {"error": "not found"})

        def _static(self, path):
            rel = "index.html" if path in ("", "/") else path.lstrip("/")
            full = os.path.realpath(os.path.join(frontend, rel))
            if not full.startswith(frontend + os.sep) or not os.path.isfile(full):
                return self._json(404, {"error": "not found"})
            with open(full, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(full)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_PUT(self):
            self._dispatch("PUT")

    return Handler


def serve(app, host, port):
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    httpd.daemon_threads = True
    return httpd
