"""
Identity for the Cocoon Desktop: the same credentials as the BioChain console,
and nothing else.

The BioChain console signs users in with Firebase Authentication (Google
provider) on the `biochain-ai` project. The Cocoon Desktop signs in against the
same Firebase Auth project, so the user logs in with the same account. The
browser then sends the Firebase **ID token** (a short-lived RS256 JWT) to the
hub, and this module verifies it locally.

Isolation contract (enforced by tests/test_auth.py and tests/test_isolation.py):
  • The only thing read from BioChain is the verified token: uid, email, name,
    picture. No Firestore, no BioChain roles or roleGrants, no Identity records,
    no signing keys.
  • Cocoon roles (owner / member / service) are the hub's own: owners come
    from COCOON_OWNER_UIDS, and everyone else who passes the allowlist is a member.
  • Accounts, desktops, profiles and sessions live in the hub's SQLite.

Verification is standard-library only: RSASSA-PKCS1-v1_5 with SHA-256 via
modular exponentiation against Google's published JWKs for
securetoken@system.gserviceaccount.com. The keys are cached in memory and on
disk (honouring Cache-Control max-age), so the hub keeps verifying through
short internet outages. Checks follow Firebase's documented rules: alg RS256,
known kid, signature, aud = project id, iss = securetoken.google.com/<project>,
exp in the future, iat and auth_time in the past, non-empty sub.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import threading
import time
import urllib.request

JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
CLOCK_SKEW_S = 300
# DER prefix of DigestInfo for SHA-256 (RFC 8017 §9.2 note 1)
_SHA256_DIGESTINFO = bytes.fromhex("3031300d060960864801650304020105000420")


class AuthError(Exception):
    """Raised for any credential that must be rejected (→ HTTP 401)."""


class Forbidden(Exception):
    """Authenticated, but not allowed on this hub (→ HTTP 403)."""


def b64url_decode(s):
    if isinstance(s, str):
        s = s.encode()
    return base64.urlsafe_b64decode(s + b"=" * (-len(s) % 4))


def b64url_encode(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _int(b64):
    return int.from_bytes(b64url_decode(b64), "big")


def rsa_pkcs1v15_sha256_verify(n, e, message, signature):
    """True iff `signature` is a valid RSASSA-PKCS1-v1_5 SHA-256 signature of `message`."""
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    s = int.from_bytes(signature, "big")
    if s >= n:
        return False
    em = pow(s, e, n).to_bytes(k, "big")
    t = _SHA256_DIGESTINFO + hashlib.sha256(message).digest()
    if k < len(t) + 11:
        return False
    expected = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return hmac.compare_digest(em, expected)


class JwksCache:
    """Google's rotating signing keys: fetched on demand, cached in memory and on disk."""

    def __init__(self, url=JWKS_URL, cache_path=None, fetch=None):
        self.url = url
        self.cache_path = cache_path
        self._fetch = fetch or self._http_fetch
        self._keys = {}
        self._expires = 0.0
        self._lock = threading.Lock()
        if cache_path and os.path.isfile(cache_path):
            try:
                with open(cache_path) as f:
                    d = json.load(f)
                self._keys = {k["kid"]: (_int(k["n"]), _int(k["e"])) for k in d["keys"]}
                self._expires = float(d.get("expires", 0))
            except (OSError, ValueError, KeyError):
                pass

    def _http_fetch(self):
        with urllib.request.urlopen(self.url, timeout=10) as r:
            body = json.loads(r.read())
            m = re.search(r"max-age=(\d+)", (r.headers or {}).get("Cache-Control", "") or "")
            return body, int(m.group(1)) if m else 3600

    def refresh(self):
        body, max_age = self._fetch()
        keys = {k["kid"]: (_int(k["n"]), _int(k["e"])) for k in body["keys"] if k.get("kty") == "RSA"}
        with self._lock:
            self._keys, self._expires = keys, time.time() + max_age
        if self.cache_path:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.cache_path)), exist_ok=True)
                with open(self.cache_path, "w") as f:
                    json.dump({"keys": body["keys"], "expires": self._expires}, f)
            except OSError:
                pass

    def get(self, kid):
        with self._lock:
            key, fresh = self._keys.get(kid), time.time() < self._expires
        if key and fresh:
            return key
        try:
            self.refresh()                       # rotated keys, or cache expired
        except Exception:
            if key:
                return key                       # offline: a known kid stays usable
            raise AuthError("cannot fetch Google signing keys (hub offline?) — use the service token")
        with self._lock:
            key = self._keys.get(kid)
        if not key:
            raise AuthError("unknown signing key id")
        return key


class FirebaseVerifier:
    def __init__(self, project_id, jwks, now=time.time):
        self.project_id = project_id
        self.jwks = jwks
        self.now = now

    def verify(self, token):
        """Return the verified claims dict, or raise AuthError."""
        try:
            h64, p64, s64 = token.split(".")
            header = json.loads(b64url_decode(h64))
            claims = json.loads(b64url_decode(p64))
            sig = b64url_decode(s64)
        except (ValueError, TypeError):
            raise AuthError("malformed token")
        if header.get("alg") != "RS256":
            raise AuthError("unexpected alg")
        n, e = self.jwks.get(header.get("kid"))
        if not rsa_pkcs1v15_sha256_verify(n, e, (h64 + "." + p64).encode(), sig):
            raise AuthError("bad signature")
        now = self.now()
        if claims.get("aud") != self.project_id:
            raise AuthError("token is for another project")
        if claims.get("iss") != "https://securetoken.google.com/" + self.project_id:
            raise AuthError("unexpected issuer")
        if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= now - CLOCK_SKEW_S:
            raise AuthError("token expired")
        if not isinstance(claims.get("iat"), (int, float)) or claims["iat"] > now + CLOCK_SKEW_S:
            raise AuthError("token issued in the future")
        if claims.get("auth_time", 0) > now + CLOCK_SKEW_S:
            raise AuthError("auth_time in the future")
        sub = claims.get("sub")
        if not isinstance(sub, str) or not sub or len(sub) > 128:
            raise AuthError("invalid subject")
        return claims


class Principal(dict):
    """Who is calling: uid, email, name, picture, role (owner|member|service|local)."""

    @property
    def uid(self):
        return self["uid"]

    @property
    def role(self):
        return self["role"]

    def is_owner(self):
        return self["role"] in ("owner", "service", "local")


class Authenticator:
    """
    Modes:
      firebase  Firebase ID token (same credentials as the BioChain console); default
      none      no login; every request is the local operator (dev/sim; loopback only)
    The service token (COCOON_API_TOKEN) is always accepted as a machine
    credential, for wearables, scripts and offline hubs.
    """

    def __init__(self, cfg, store, verifier=None):
        self.cfg = cfg
        self.store = store
        self.mode = cfg.auth_mode
        self.owners = {u.strip() for u in cfg.owner_uids.split(",") if u.strip()}
        self.allowed_uids = {u.strip() for u in cfg.allowed_uids.split(",") if u.strip()}
        self.allowed_emails = {e.strip().lower() for e in cfg.allowed_emails.split(",") if e.strip()}
        if self.mode == "firebase" and verifier is None:
            verifier = FirebaseVerifier(cfg.firebase_project_id,
                                        JwksCache(url=cfg.jwks_url,
                                                  cache_path=os.path.join(cfg.data_dir, "google_jwks.json")))
        self.verifier = verifier

    def _allowed(self, claims):
        if not self.allowed_uids and not self.allowed_emails:
            return True
        if claims["sub"] in self.allowed_uids or claims["sub"] in self.owners:
            return True
        email = (claims.get("email") or "").lower()
        if not claims.get("email_verified"):
            return False
        domain = email.rsplit("@", 1)[-1]
        return email in self.allowed_emails or ("@" + domain) in self.allowed_emails

    def authenticate(self, authorization_header):
        """Return a Principal or raise AuthError / Forbidden."""
        h = authorization_header or ""
        token = h[7:].strip() if h.startswith("Bearer ") else ""
        if self.cfg.api_token and token and hmac.compare_digest(token, self.cfg.api_token):
            return Principal(uid="service", email=None, name="Service token", picture=None, role="service")
        if self.mode == "none":
            return Principal(uid="local", email=None, name="Local operator", picture=None, role="local")
        if not token:
            raise AuthError("sign in required")
        claims = self.verifier.verify(token)
        if not self._allowed(claims):
            raise Forbidden("this account is not on this hub's allowlist")
        role = "owner" if claims["sub"] in self.owners else "member"
        p = Principal(uid=claims["sub"], email=claims.get("email"), name=claims.get("name") or claims.get("email"),
                      picture=claims.get("picture"), role=role)
        self.store.upsert_account(p.uid, p["email"], p["name"], role)
        return p
