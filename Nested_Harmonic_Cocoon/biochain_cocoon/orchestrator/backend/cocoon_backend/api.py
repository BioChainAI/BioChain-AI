"""
HTTP JSON API + the Cocoon Desktop frontend. Standard library only.

Reference: docs/api_reference/orchestrator_api.md.

Authentication (auth.py): every /api route except /api/auth/config and
/api/health needs `Authorization: Bearer <token>`, where the token is either:
  • a Firebase ID token for the BioChain account (same credentials as the
    BioChain console), or
  • the hub's service token (COCOON_API_TOKEN), for wearables and scripts.
With COCOON_AUTH=none (dev/sim, loopback only) every caller is the local operator.

Authorisation is cocoon-local:
  member  own desktop, own profiles, own sessions/receipts/events; may start a
          session when the cocoon is free; may always stop (safety)
  owner   everything, including other users' data, puck placement, and accounts
Another user's biostate (health data) is never shown to a member.
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
from .auth import AuthError, Forbidden
from .desktop import TEMPLATES, DEFAULT_TEMPLATE

PRESET_DIR = os.path.join(COCOON_ROOT, "standalone_presets")


class Conflict(Exception):
    pass


def load_presets():
    out = []
    for fn in sorted(glob.glob(os.path.join(PRESET_DIR, "*.json"))):
        with open(fn) as f:
            p = json.load(f)
        p.pop("$schema", None)
        out.append(p)
    return out


class App:
    def __init__(self, cfg, engine, store, registry, authenticator, catalog):
        self.cfg, self.engine, self.store, self.registry = cfg, engine, store, registry
        self.auth, self.catalog = authenticator, catalog
        self.presets = load_presets()
        P = None  # marker: public route
        self.routes = [
            # (method, pattern, handler, access)  access: None=public, "member", "owner"
            ("GET", r"/api/health$", lambda p, m, b, q: {"ok": True, "version": __version__}, P),
            ("GET", r"/api/auth/config$", lambda p, m, b, q: self.cfg.public_auth_config(), P),
            ("GET", r"/api/me$", self.me, "member"),
            ("GET", r"/api/modules$", self.modules, "member"),
            ("GET", r"/api/desktop$", self.get_desktop, "member"),
            ("PUT", r"/api/desktop$", self.put_desktop, "member"),
            ("POST", r"/api/desktop/reset$", self.reset_desktop, "member"),
            ("GET", r"/api/accounts$", lambda p, m, b, q: self.store.accounts(), "owner"),
            ("GET", r"/api/status$", self.status, "member"),
            ("GET", r"/api/nodes$", self.nodes, "member"),
            ("PUT", r"/api/nodes/(\d+)/position$", self.set_position, "owner"),
            ("GET", r"/api/presets$", lambda p, m, b, q: self.presets, "member"),
            ("POST", r"/api/presets/(\d+)/play$", self.play_preset, "member"),
            ("GET", r"/api/profiles$", self.profiles, "member"),
            ("POST", r"/api/profiles$", self.create_profile, "member"),
            ("PUT", r"/api/profiles/(\d+)/consent$", self.set_consent, "member"),
            ("POST", r"/api/session/start$", self.start, "member"),
            ("POST", r"/api/session/stop$", self.stop, "member"),
            ("GET", r"/api/sessions$", self.sessions, "member"),
            ("GET", r"/api/sessions/([0-9a-f]{32})/receipt$", self.receipt, "member"),
            ("POST", r"/api/command$", self.command, "member"),
            ("POST", r"/api/stop_all$", self.stop_all, "member"),
            ("POST", r"/api/biofeedback$", self.biofeedback, "member"),
            ("GET", r"/api/events$", self.events, "member"),
        ]

    # --- helpers ---------------------------------------------------------
    @staticmethod
    def _scope(p):
        """None = unrestricted (owner); else the uid to restrict queries to."""
        return None if p.is_owner() else p.uid

    def _active_is_mine(self, p):
        s = self.engine.session
        return bool(s) and (p.is_owner() or s.get("owner_uid") == p.uid)

    def _require_free_or_mine(self, p):
        s = self.engine.session
        if s and not self._active_is_mine(p):
            raise Conflict("the cocoon is in use by another account's session")

    def _own_profile(self, p, pid):
        prof = self.store.profile(int(pid))
        if not prof or (not p.is_owner() and prof.get("owner_uid") != p.uid):
            raise KeyError("no such profile")
        return prof

    # --- identity & desktop ----------------------------------------------
    def me(self, p, m, b, q):
        acct = self.store.account(p.uid) or {}
        return {"uid": p.uid, "email": p["email"], "name": p["name"], "picture": p["picture"], "role": p.role,
                "auth_mode": self.cfg.auth_mode, "since": acct.get("created")}

    def modules(self, p, m, b, q):
        return {"modules": self.catalog.visible_to(p),
                "templates": {k: {"label": v["label"], "description": v["description"]} for k, v in TEMPLATES.items()}}

    def get_desktop(self, p, m, b, q):
        layout, updated = self.store.desktop(p.uid)
        if layout is None:
            return {"layout": self.catalog.template_layout(DEFAULT_TEMPLATE, p), "first_run": True, "updated": None}
        # drop modules that were uninstalled from the hub since the layout was saved
        known = {x["id"] for x in self.catalog.visible_to(p)}
        layout["modules"] = [x for x in layout["modules"] if x["id"] in known]
        return {"layout": layout, "first_run": False, "updated": updated}

    def put_desktop(self, p, m, b, q):
        clean = self.catalog.check_layout(b, p)
        self.store.save_desktop(p.uid, clean)
        return {"ok": True, "layout": clean}

    def reset_desktop(self, p, m, b, q):
        name = b.get("template", DEFAULT_TEMPLATE)
        if name not in TEMPLATES:
            raise ValueError("unknown template")
        layout = self.catalog.template_layout(name, p)
        self.store.save_desktop(p.uid, layout)
        return {"ok": True, "layout": layout}

    # --- cocoon ----------------------------------------------------------
    def status(self, p, m, b, q):
        s = self.engine.status()
        mine = self._active_is_mine(p)
        if s["session"] and not mine:
            # someone else's session: the room is busy, but their health data stays private
            s["session"] = {"active": True, "mine": False, "target": s["session"]["target"],
                            "started": s["session"]["started"]}
            s["biostate"] = None
            s["guide"] = None
            s["last_commands"] = {}
        elif s["session"]:
            s["session"] = dict(s["session"], active=True, mine=True)
        return {"version": __version__, "time": time.time(), **s,
                "nodes_online": sum(1 for n in self.registry.nodes(time.time()) if n["online"])}

    def nodes(self, p, m, b, q):
        return self.registry.nodes(time.time())

    def set_position(self, p, m, b, q):
        pos = b.get("pos")
        if not (isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) for v in pos)):
            raise ValueError("pos must be [x, y, z] in metres")
        self.registry.set_position(int(m.group(1)), pos, b.get("label"))
        return {"ok": True}

    def play_preset(self, p, m, b, q):
        self._require_free_or_mine(p)
        pid = int(m.group(1))
        if not any(x["id"] == pid for x in self.presets):
            raise KeyError("no such preset")
        self.engine.play_preset(pid)
        return {"ok": True}

    def profiles(self, p, m, b, q):
        return self.store.profiles(owner_uid=self._scope(p))

    def create_profile(self, p, m, b, q):
        name = str(b.get("name", "")).strip()
        if not name or len(name) > 80:
            raise ValueError("name required (≤ 80 chars)")
        return {"id": self.store.create_profile(name, b.get("prefs"), owner_uid=p.uid)}

    def set_consent(self, p, m, b, q):
        self._own_profile(p, m.group(1))
        self.store.set_photosensitive_consent(int(m.group(1)), bool(b.get("photosensitive_consent")))
        return self.store.profile(int(m.group(1)))

    def start(self, p, m, b, q):
        self._require_free_or_mine(p)
        if b.get("profile_id") is not None:
            self._own_profile(p, b["profile_id"])
        return self.engine.start(b.get("target", "alpha"), profile_id=b.get("profile_id"),
                                 audio_mode=b.get("audio_mode", "isochronic"),
                                 photosensitive_consent=bool(b.get("photosensitive_consent")),
                                 modalities=tuple(b.get("modalities") or ("audio", "photonic", "haptic", "coil")),
                                 preset_id=b.get("preset_id"), owner_uid=p.uid)

    def stop(self, p, m, b, q):
        # Anyone signed in may stop the cocoon: stopping is always the safe action.
        return self.engine.stop(int(b.get("fade_ms", 8000))) or {"ok": True, "session": None}

    def sessions(self, p, m, b, q):
        return self.store.sessions(owner_uid=self._scope(p))

    def receipt(self, p, m, b, q):
        sess = self.store.session(m.group(1))
        if not sess or (not p.is_owner() and sess.get("owner_uid") != p.uid):
            raise KeyError("no such session")
        r = self.store.receipt(m.group(1))
        if r is None:
            raise KeyError("no receipt (bridge disabled or session still running)")
        return r

    def command(self, p, m, b, q):
        self._require_free_or_mine(p)
        return {"sent": self.engine.manual_command(b)}

    def stop_all(self, p, m, b, q):
        self.engine.stop_all(int(b.get("fade_ms", 3000)))
        return {"ok": True}

    def biofeedback(self, p, m, b, q):
        s = self.engine.session
        if s and not (p.role in ("service", "local", "owner") or s.get("owner_uid") == p.uid):
            raise PermissionError("biofeedback is accepted only for your own session")
        return {"biostate": self.engine.ingest_biofeedback(b)}

    def events(self, p, m, b, q):
        since = int(q.get("since", ["0"])[0])
        sid = q.get("session", [None])[0]
        if sid:
            sess = self.store.session(sid)
            if not sess or (not p.is_owner() and sess.get("owner_uid") != p.uid):
                raise KeyError("no such session")
            return self.store.events(sid, since)
        return self.store.events(None, since, owner_uid=self._scope(p))


def make_handler(app):
    frontend = os.path.realpath(app.cfg.frontend_dir)

    class Handler(BaseHTTPRequestHandler):
        server_version = "cocoon/" + __version__

        def log_message(self, fmt, *args):
            pass

        def _send(self, code, data, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(data)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj, default=str).encode(), "application/json")

        def _dispatch(self, method):
            url = urlparse(self.path)
            if not url.path.startswith("/api/"):
                return self._static(url.path) if method == "GET" else self._json(405, {"error": "method"})
            for meth, pattern, fn, access in app.routes:
                mt = re.match(pattern, url.path)
                if not (mt and meth == method):
                    continue
                principal = None
                if access is not None:
                    try:
                        principal = app.auth.authenticate(self.headers.get("Authorization"))
                    except AuthError as e:
                        return self._json(401, {"error": str(e)})
                    except Forbidden as e:
                        return self._json(403, {"error": str(e)})
                    if access == "owner" and not principal.is_owner():
                        return self._json(403, {"error": "owner role required"})
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
                try:
                    return self._json(200, fn(principal, mt, body, parse_qs(url.query)))
                except PermissionError as e:
                    return self._json(403, {"error": str(e)})
                except Conflict as e:
                    return self._json(409, {"error": str(e)})
                except KeyError as e:
                    return self._json(404, {"error": str(e).strip("'\"")})
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
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            if full.endswith(".js"):
                ctype = "text/javascript"
            self._send(200, data, ctype)

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
