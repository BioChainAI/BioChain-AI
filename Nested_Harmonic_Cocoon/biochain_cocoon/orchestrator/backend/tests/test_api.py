"""End-to-end HTTP tests: real server, real signed ID tokens, several accounts."""
import json
import os
import threading
import unittest
import urllib.error
import urllib.request

from helpers import rig
from rsa_testkit import TestKey
from cocoon_backend.api import App, serve
from cocoon_backend.auth import Authenticator, FirebaseVerifier, JwksCache
from cocoon_backend.desktop import ModuleCatalog

KEY = TestKey(seed=21)


class Hub(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        eng, pucks, clk, wall, store, reg = rig()
        cfg = eng.cfg
        cfg.auth_mode, cfg.api_token, cfg.owner_uids = "firebase", "svc-token", "owner-1"
        ver = FirebaseVerifier("biochain-ai", JwksCache(fetch=lambda: ({"keys": [KEY.jwk()]}, 3600)))
        catalog = ModuleCatalog(os.path.join(cfg.frontend_dir, "modules"))
        cls.eng, cls.store = eng, store
        cls.httpd = serve(App(cfg, eng, store, reg, Authenticator(cfg, store, verifier=ver), catalog), "127.0.0.1", 0)
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def tearDown(self):
        self.eng.stop()

    def req(self, method, path, body=None, who="alice"):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method)
        r.add_header("Content-Type", "application/json")
        if who == "svc":
            r.add_header("Authorization", "Bearer svc-token")
        elif who:
            r.add_header("Authorization", "Bearer " + KEY.token(who))
        try:
            with urllib.request.urlopen(r, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())


class PublicAndAuth(Hub):
    def test_public_config_has_no_secrets(self):
        code, c = self.req("GET", "/api/auth/config", who=None)
        self.assertEqual(code, 200)
        self.assertEqual(c["mode"], "firebase")
        self.assertEqual(set(c["firebase"]), {"apiKey", "authDomain", "projectId", "appId"})
        self.assertNotIn("svc-token", json.dumps(c))

    def test_everything_else_needs_sign_in(self):
        for path in ("/api/me", "/api/status", "/api/desktop", "/api/sessions", "/api/presets"):
            self.assertEqual(self.req("GET", path, who=None)[0], 401, path)
        self.assertEqual(self.req("POST", "/api/stop_all", {}, who=None)[0], 401)

    def test_forged_token_rejected(self):
        r = urllib.request.Request(self.base + "/api/me")
        r.add_header("Authorization", "Bearer " + TestKey(seed=99, kid=KEY.kid).token("alice"))
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(r, timeout=5)
        self.assertEqual(cm.exception.code, 401)

    def test_me_and_roles(self):
        self.assertEqual(self.req("GET", "/api/me", who="alice")[1]["role"], "member")
        self.assertEqual(self.req("GET", "/api/me", who="owner-1")[1]["role"], "owner")
        self.assertEqual(self.req("GET", "/api/accounts", who="alice")[0], 403)
        self.assertEqual(self.req("GET", "/api/accounts", who="owner-1")[0], 200)
        self.assertEqual(self.req("PUT", "/api/nodes/1/position", {"pos": [0, 0, 0]}, who="alice")[0], 403)
        self.assertEqual(self.req("PUT", "/api/nodes/1/position", {"pos": [0, 0, 0]}, who="owner-1")[0], 200)


class Desktop(Hub):
    def test_first_run_template_then_personal_layout(self):
        code, d = self.req("GET", "/api/desktop", who="dora")
        self.assertTrue(d["first_run"])
        self.assertEqual(d["layout"]["modules"][0]["id"], "overview")
        layout = {"version": 1, "theme": "dark", "modules": [
            {"instance": "overview-1", "id": "overview", "size": "xl", "settings": {"quickTarget": "theta"}},
            {"instance": "mesh_health-1", "id": "mesh_health", "size": "l"}]}
        self.assertEqual(self.req("PUT", "/api/desktop", layout, who="dora")[0], 200)
        code, d = self.req("GET", "/api/desktop", who="dora")
        self.assertFalse(d["first_run"])
        self.assertEqual([m["id"] for m in d["layout"]["modules"]], ["overview", "mesh_health"])
        self.assertEqual(d["layout"]["modules"][0]["settings"]["quickTarget"], "theta")
        # another user's desktop is untouched
        self.assertTrue(self.req("GET", "/api/desktop", who="erin")[1]["first_run"])

    def test_layout_validation(self):
        bad = [
            {"version": 1, "modules": [{"instance": "nope-1", "id": "nope", "size": "m"}]},
            {"version": 1, "modules": [{"instance": "overview-1", "id": "overview", "size": "s"}]},          # size not allowed
            {"version": 1, "modules": [{"instance": "session-1", "id": "session", "size": "m"},
                                       {"instance": "session-2", "id": "session", "size": "m"}]},             # singleton
            {"version": 1, "modules": [{"instance": "hub_accounts-1", "id": "hub_accounts", "size": "l"}]},   # owner-only
            {"version": 1, "modules": [{"instance": "overview-1", "id": "overview", "size": "xl",
                                        "settings": {"x": "y" * 9000}}]},                                      # too large
        ]
        for b in bad:
            with self.subTest(b=json.dumps(b)[:80]):
                self.assertEqual(self.req("PUT", "/api/desktop", b, who="alice")[0], 400)
        ok = {"version": 1, "modules": [{"instance": "hub_accounts-1", "id": "hub_accounts", "size": "l"}]}
        self.assertEqual(self.req("PUT", "/api/desktop", ok, who="owner-1")[0], 200)

    def test_catalog_hides_owner_modules_from_members(self):
        ids = {m["id"] for m in self.req("GET", "/api/modules", who="alice")[1]["modules"]}
        self.assertNotIn("hub_accounts", ids)
        self.assertIn("hub_accounts", {m["id"] for m in self.req("GET", "/api/modules", who="owner-1")[1]["modules"]})

    def test_reset_to_template(self):
        code, r = self.req("POST", "/api/desktop/reset", {"template": "engineer"}, who="frank")
        self.assertIn("mesh_health", [m["id"] for m in r["layout"]["modules"]])


class Isolation(Hub):
    def test_profiles_are_private(self):
        _, a = self.req("POST", "/api/profiles", {"name": "Alice's client"}, who="alice")
        self.req("POST", "/api/profiles", {"name": "Bob's client"}, who="bob")
        names = [p["name"] for p in self.req("GET", "/api/profiles", who="alice")[1]]
        self.assertEqual(names, ["Alice's client"])
        self.assertEqual(self.req("PUT", "/api/profiles/%d/consent" % a["id"], {"photosensitive_consent": True}, who="bob")[0], 404)
        self.assertEqual(self.req("POST", "/api/session/start", {"target": "alpha", "profile_id": a["id"]}, who="bob")[0], 404)
        self.assertEqual(len(self.req("GET", "/api/profiles", who="owner-1")[1]), 2)

    def test_one_cocoon_one_session_and_private_biostate(self):
        code, s = self.req("POST", "/api/session/start", {"target": "theta", "modalities": ["audio"]}, who="alice")
        self.assertEqual(code, 200)
        self.assertEqual(self.req("POST", "/api/biofeedback", {"t": 1.0, "source": "w", "rr_ms": [800, 820, 790, 810]}, who="alice")[0], 200)
        # bob sees that the room is busy, not alice's health data
        st = self.req("GET", "/api/status", who="bob")[1]
        self.assertEqual(st["session"], {"active": True, "mine": False, "target": "theta", "started": st["session"]["started"]})
        self.assertIsNone(st["biostate"])
        self.assertIsNone(st["guide"])
        self.assertIsNotNone(self.req("GET", "/api/status", who="alice")[1]["biostate"])
        # bob cannot take over, send commands, push biofeedback, or read alice's events
        self.assertEqual(self.req("POST", "/api/session/start", {"target": "beta"}, who="bob")[0], 409)
        self.assertEqual(self.req("POST", "/api/command", {"cmd": "update_geo", "fc": 432, "fe": 10, "amp": 0.2}, who="bob")[0], 409)
        self.assertEqual(self.req("POST", "/api/biofeedback", {"t": 2.0, "source": "w", "hr_bpm": 70}, who="bob")[0], 403)
        self.assertEqual(self.req("GET", "/api/events?session=" + s["id"], who="bob")[0], 404)
        self.assertEqual(self.req("GET", "/api/events", who="bob")[1], [])
        self.assertTrue(self.req("GET", "/api/events", who="alice")[1])
        # the service token (wearable bridge) may feed the active session
        self.assertEqual(self.req("POST", "/api/biofeedback", {"t": 3.0, "source": "w", "hr_bpm": 64}, who="svc")[0], 200)
        # but anyone may stop, for safety
        self.assertEqual(self.req("POST", "/api/session/stop", {}, who="bob")[0], 200)
        self.assertEqual([x["owner_uid"] for x in self.req("GET", "/api/sessions", who="alice")[1]], ["alice"])
        self.assertEqual(self.req("GET", "/api/sessions", who="bob")[1], [])

    def test_static_and_traversal(self):
        with urllib.request.urlopen(self.base + "/", timeout=5) as r:
            self.assertIn(b"Harmonic Cocoon", r.read())
        with urllib.request.urlopen(self.base + "/modules/overview/module.js", timeout=5) as r:
            self.assertEqual(r.headers["Content-Type"], "text/javascript")
        self.assertEqual(self.req("GET", "/../../../etc/passwd", who=None)[0], 404)


if __name__ == "__main__":
    unittest.main()
