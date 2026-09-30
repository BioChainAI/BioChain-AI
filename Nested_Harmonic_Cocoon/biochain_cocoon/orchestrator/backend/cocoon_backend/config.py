"""Runtime configuration from environment variables (12-factor; Docker-friendly)."""
import os
from dataclasses import dataclass, field

from . import COCOON_ROOT


def _env(name, default, cast=str):
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    if cast is bool:
        return v.lower() in ("1", "true", "yes", "on")
    return cast(v)


@dataclass
class Config:
    http_host: str = field(default_factory=lambda: _env("COCOON_HTTP_HOST", "127.0.0.1"))
    http_port: int = field(default_factory=lambda: _env("COCOON_HTTP_PORT", 8640, int))
    # mesh transport: "udp" (Wi-Fi broadcast), "serial" (USB ESP-NOW gateway puck), "loopback" (sim/tests)
    transport: str = field(default_factory=lambda: _env("COCOON_TRANSPORT", "udp"))
    udp_broadcast: str = field(default_factory=lambda: _env("COCOON_UDP_BROADCAST", "255.255.255.255"))
    udp_port: int = field(default_factory=lambda: _env("COCOON_UDP_PORT", 47632, int))
    serial_port: str = field(default_factory=lambda: _env("COCOON_SERIAL_PORT", "/dev/ttyUSB0"))
    db_path: str = field(default_factory=lambda: _env("COCOON_DB", os.path.join(COCOON_ROOT, "orchestrator", "cocoon.db")))
    tick_hz: float = field(default_factory=lambda: _env("COCOON_TICK_HZ", 50.0, float))
    heartbeat_s: float = field(default_factory=lambda: _env("COCOON_HEARTBEAT_S", 2.0, float))
    pi6_slew_ms: int = field(default_factory=lambda: _env("COCOON_PI6_SLEW_MS", 50, int))
    # pi6: send every Nth π/6 marker (1 = all 12 per macro cycle). At 40 Hz, all 12
    # would be 480 packets/s, so the scheduler caps the rate automatically.
    pi6_max_rate_hz: float = field(default_factory=lambda: _env("COCOON_PI6_MAX_RATE_HZ", 12.0, float))
    frontend_dir: str = field(default_factory=lambda: os.path.join(COCOON_ROOT, "orchestrator", "frontend"))
    # optional BioChain ecosystem bridge
    biochain_bridge: bool = field(default_factory=lambda: _env("COCOON_BIOCHAIN_BRIDGE", False, bool))
    biochain_protocol_path: str = field(default_factory=lambda: _env(
        "BIOCHAIN_PROTOCOL_PATH", os.path.normpath(os.path.join(COCOON_ROOT, "..", "..", "protocol"))))
    api_token: str = field(default_factory=lambda: _env("COCOON_API_TOKEN", ""))
    data_dir: str = field(default_factory=lambda: _env("COCOON_DATA_DIR", os.path.join(COCOON_ROOT, "orchestrator", ".data")))

    # --- identity: the same Firebase Auth project as the BioChain console ------
    # Only authentication is shared. The cocoon never reads BioChain's Firestore,
    # roles or identity records. These are the *public* web-app identifiers
    # (a Firebase web apiKey is not a secret), and env vars override them to
    # point a hub at another tenant.
    auth_mode: str = field(default_factory=lambda: _env("COCOON_AUTH", "firebase"))   # firebase | none
    firebase_project_id: str = field(default_factory=lambda: _env("COCOON_FIREBASE_PROJECT_ID", "biochain-ai"))
    firebase_api_key: str = field(default_factory=lambda: _env("COCOON_FIREBASE_API_KEY", "AIzaSyCIOlhkngpzqU15GiTPXiWUpWX5U0tYyIg"))
    firebase_auth_domain: str = field(default_factory=lambda: _env("COCOON_FIREBASE_AUTH_DOMAIN", "biochain-ai.firebaseapp.com"))
    firebase_app_id: str = field(default_factory=lambda: _env("COCOON_FIREBASE_APP_ID", "1:154632169740:web:689b3e1196c76a40350129"))
    # Where to fetch the token-signing keys. Default: Google's securetoken JWKs.
    # Override only for a private identity tenant or for tests (file:// is accepted).
    jwks_url: str = field(default_factory=lambda: _env(
        "COCOON_JWKS_URL", "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"))
    # cocoon-local authorisation (never taken from BioChain)
    owner_uids: str = field(default_factory=lambda: _env("COCOON_OWNER_UIDS", ""))
    allowed_uids: str = field(default_factory=lambda: _env("COCOON_ALLOWED_UIDS", ""))
    allowed_emails: str = field(default_factory=lambda: _env("COCOON_ALLOWED_EMAILS", ""))   # emails or @domain

    def public_auth_config(self):
        """What the browser needs to start Firebase Auth. No secrets."""
        return {"mode": self.auth_mode, "firebase": {
            "apiKey": self.firebase_api_key, "authDomain": self.firebase_auth_domain,
            "projectId": self.firebase_project_id, "appId": self.firebase_app_id}}
