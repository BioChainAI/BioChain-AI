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
