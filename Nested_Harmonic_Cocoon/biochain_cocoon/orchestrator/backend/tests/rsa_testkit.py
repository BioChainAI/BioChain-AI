"""Test-only RSA keypair + Firebase-shaped ID token minting (stdlib, deterministic)."""
import hashlib
import json
import random
import time

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend.auth import b64url_encode, _SHA256_DIGESTINFO


def _is_probable_prime(n, rng, rounds=24):
    if n < 4:
        return n in (2, 3)
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rounds):
        x = pow(rng.randrange(2, n - 2), d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _prime(bits, rng):
    while True:
        c = rng.getrandbits(bits) | (1 << (bits - 1)) | 1
        if _is_probable_prime(c, rng):
            return c


class TestKey:
    def __init__(self, seed=1, bits=1024, kid="test-kid"):
        rng = random.Random(seed)
        e = 65537
        while True:
            p, q = _prime(bits // 2, rng), _prime(bits // 2, rng)
            phi = (p - 1) * (q - 1)
            if p != q and phi % e:
                break
        self.n, self.e, self.d, self.kid = p * q, e, pow(e, -1, phi), kid

    def jwk(self):
        k = (self.n.bit_length() + 7) // 8
        return {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": self.kid,
                "n": b64url_encode(self.n.to_bytes(k, "big")), "e": b64url_encode(self.e.to_bytes(3, "big"))}

    def sign(self, msg):
        k = (self.n.bit_length() + 7) // 8
        t = _SHA256_DIGESTINFO + hashlib.sha256(msg).digest()
        em = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
        return pow(int.from_bytes(em, "big"), self.d, self.n).to_bytes(k, "big")

    def token(self, sub="user-a", project="biochain-ai", now=None, **over):
        now = now or time.time()
        claims = {"iss": "https://securetoken.google.com/" + project, "aud": project, "auth_time": now - 60,
                  "sub": sub, "iat": now - 30, "exp": now + 3600, "email": sub + "@example.com",
                  "email_verified": True, "name": sub.title(), "firebase": {"sign_in_provider": "google.com"}}
        claims.update(over)
        header = {"alg": over.pop("_alg", "RS256"), "kid": over.pop("_kid", self.kid), "typ": "JWT"}
        claims.pop("_alg", None)
        claims.pop("_kid", None)
        h = b64url_encode(json.dumps(header).encode())
        p = b64url_encode(json.dumps(claims).encode())
        return h + "." + p + "." + b64url_encode(self.sign((h + "." + p).encode()))
