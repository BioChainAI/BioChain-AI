import json
import threading
import unittest
import urllib.error
import urllib.request

from helpers import rig
from cocoon_backend.api import App, serve


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        eng, pucks, clk, wall, store, reg = rig()
        eng.cfg.api_token = "t0ken"
        cls.eng = eng
        cls.httpd = serve(App(eng.cfg, eng, store, reg), "127.0.0.1", 0)
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def req(self, method, path, body=None, token="t0ken"):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method)
        r.add_header("Content-Type", "application/json")
        if token:
            r.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(r, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_status_and_presets(self):
        code, s = self.req("GET", "/api/status")
        self.assertEqual(code, 200)
        self.assertIn("clock", s)
        code, p = self.req("GET", "/api/presets")
        self.assertEqual(len(p), 7)
        self.assertEqual(p[0]["slug"], "deep_sleep_theta")

    def test_auth_required_for_mutations(self):
        code, _ = self.req("POST", "/api/stop_all", {}, token=None)
        self.assertEqual(code, 401)

    def test_command_validation(self):
        code, e = self.req("POST", "/api/command", {"cmd": "update_geo", "fc": 432, "fe": 99, "amp": 0.2})
        self.assertEqual(code, 400)
        self.assertIn("maximum", e["error"])
        code, ok = self.req("POST", "/api/command", {"cmd": "update_geo", "fc": 432, "fe": 10, "amp": 0.2})
        self.assertEqual(code, 200)

    def test_session_lifecycle(self):
        code, s = self.req("POST", "/api/session/start", {"target": "theta", "modalities": ["audio"]})
        self.assertEqual(code, 200)
        code, b = self.req("POST", "/api/biofeedback", {"t": 1.0, "source": "test", "rr_ms": [800, 820, 790, 810]})
        self.assertEqual(code, 200)
        self.assertIn("calm", b["biostate"])
        code, _ = self.req("POST", "/api/session/stop", {})
        self.assertEqual(code, 200)

    def test_static_and_traversal(self):
        with urllib.request.urlopen(self.base + "/", timeout=5) as r:
            self.assertIn(b"Harmonic Cocoon", r.read())
        code, _ = self.req("GET", "/../../../etc/passwd")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
