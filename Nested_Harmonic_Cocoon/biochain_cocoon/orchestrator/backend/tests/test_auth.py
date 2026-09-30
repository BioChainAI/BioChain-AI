import os
import tempfile
import time
import unittest

from helpers import Store, cocoon_backend  # noqa: F401
from rsa_testkit import TestKey
from cocoon_backend.auth import (AuthError, Authenticator, FirebaseVerifier, Forbidden, JwksCache,
                                 rsa_pkcs1v15_sha256_verify)
from cocoon_backend.config import Config

KEY = TestKey(seed=11)
OTHER = TestKey(seed=12, kid="other-kid")


def verifier(keys=(KEY,), fetch_count=None):
    def fetch():
        if fetch_count is not None:
            fetch_count.append(1)
        return {"keys": [k.jwk() for k in keys]}, 3600
    return FirebaseVerifier("biochain-ai", JwksCache(fetch=fetch))


class Rsa(unittest.TestCase):
    def test_pkcs1_roundtrip_and_tamper(self):
        sig = KEY.sign(b"hello")
        self.assertTrue(rsa_pkcs1v15_sha256_verify(KEY.n, KEY.e, b"hello", sig))
        self.assertFalse(rsa_pkcs1v15_sha256_verify(KEY.n, KEY.e, b"hellO", sig))
        bad = bytearray(sig); bad[-1] ^= 1
        self.assertFalse(rsa_pkcs1v15_sha256_verify(KEY.n, KEY.e, b"hello", bytes(bad)))
        self.assertFalse(rsa_pkcs1v15_sha256_verify(OTHER.n, OTHER.e, b"hello", sig))


class FirebaseTokens(unittest.TestCase):
    def test_valid_token(self):
        c = verifier().verify(KEY.token("alice"))
        self.assertEqual(c["sub"], "alice")

    def test_rejections(self):
        v = verifier()
        now = time.time()
        cases = {
            "wrong project": KEY.token(aud="someone-else"),
            "wrong issuer": KEY.token(iss="https://evil.example"),
            "expired": KEY.token(exp=now - 3600),
            "future iat": KEY.token(iat=now + 3600),
            "empty sub": KEY.token(sub=""),
            "alg none": KEY.token(_alg="none"),
            "unknown kid": KEY.token(_kid="nope"),
            "signed by another key": OTHER.token(_kid=KEY.kid),
            "garbage": "not.a.token",
        }
        for name, tok in cases.items():
            with self.subTest(name):
                with self.assertRaises(AuthError):
                    v.verify(tok)

    def test_payload_tamper_breaks_signature(self):
        h, p, s = KEY.token("alice").split(".")
        forged = KEY.token("mallory").split(".")[1]
        with self.assertRaises(AuthError):
            verifier().verify(".".join((h, forged, s)))

    def test_key_rotation_refetches(self):
        calls = []
        keys = [KEY]
        def fetch():
            calls.append(1)
            return {"keys": [k.jwk() for k in keys]}, 3600
        v = FirebaseVerifier("biochain-ai", JwksCache(fetch=fetch))
        v.verify(KEY.token())
        keys.append(OTHER)                      # Google rotates in a new key
        v.verify(OTHER.token())
        self.assertEqual(len(calls), 2)

    def test_disk_cache_survives_offline_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "jwks.json")
            JwksCache(cache_path=path, fetch=lambda: ({"keys": [KEY.jwk()]}, 3600)).refresh()
            def offline():
                raise OSError("no network")
            v = FirebaseVerifier("biochain-ai", JwksCache(cache_path=path, fetch=offline))
            self.assertEqual(v.verify(KEY.token("bob"))["sub"], "bob")


class Authenticate(unittest.TestCase):
    def make(self, **cfg):
        c = Config()
        c.auth_mode = "firebase"
        c.api_token = "svc"
        for k, v in cfg.items():
            setattr(c, k, v)
        store = Store(":memory:")
        return Authenticator(c, store, verifier=verifier()), store

    def test_member_owner_service(self):
        a, store = self.make(owner_uids="boss")
        self.assertEqual(a.authenticate("Bearer " + KEY.token("alice")).role, "member")
        self.assertEqual(a.authenticate("Bearer " + KEY.token("boss")).role, "owner")
        self.assertEqual(a.authenticate("Bearer svc").role, "service")
        self.assertEqual({x["uid"] for x in store.accounts()}, {"alice", "boss"})
        with self.assertRaises(AuthError):
            a.authenticate(None)
        with self.assertRaises(AuthError):
            a.authenticate("Bearer wrong-service-token")

    def test_allowlist_by_email_domain(self):
        a, _ = self.make(allowed_emails="@clinic.example")
        with self.assertRaises(Forbidden):
            a.authenticate("Bearer " + KEY.token("alice"))
        ok = KEY.token("carol", email="carol@clinic.example")
        self.assertEqual(a.authenticate("Bearer " + ok).uid, "carol")
        unverified = KEY.token("dave", email="dave@clinic.example", email_verified=False)
        with self.assertRaises(Forbidden):
            a.authenticate("Bearer " + unverified)

    def test_none_mode_is_local_operator(self):
        a, _ = self.make(auth_mode="none")
        self.assertEqual(a.authenticate(None).role, "local")


if __name__ == "__main__":
    unittest.main()
