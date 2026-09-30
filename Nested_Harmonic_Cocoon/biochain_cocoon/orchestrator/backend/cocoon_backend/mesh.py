"""
Mesh transports. Each one moves raw 52-byte shd-ccp frames.

  UdpTransport          Wi-Fi broadcast (pucks built with COCOON_WIFI_SSID)
  SerialGatewayTransport USB-attached gateway puck (firmware/nodes/mesh_gateway)
                         that bridges to ESP-NOW; SLIP-framed; needs pyserial
  LoopbackBus           in-process bus for the simulator and tests
"""
import socket

from .shdccp import PACKET_SIZE


class Transport:
    def send(self, frame):
        raise NotImplementedError

    def recv(self):
        """Return a list of received frames (non-blocking)."""
        raise NotImplementedError

    def close(self):
        pass


class UdpTransport(Transport):
    def __init__(self, broadcast="255.255.255.255", port=47632):
        self.addr = (broadcast, port)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(("", port))
        self.sock.setblocking(False)

    def send(self, frame):
        self.sock.sendto(frame, self.addr)

    def recv(self):
        out = []
        while True:
            try:
                data, _ = self.sock.recvfrom(256)
            except (BlockingIOError, InterruptedError):
                return out
            if len(data) == PACKET_SIZE:
                out.append(data)

    def close(self):
        self.sock.close()


# SLIP (RFC 1055) framing for the serial gateway
_END, _ESC, _ESC_END, _ESC_ESC = 0xC0, 0xDB, 0xDC, 0xDD


def slip_encode(frame):
    out = bytearray([_END])
    for b in frame:
        if b == _END:
            out += bytes([_ESC, _ESC_END])
        elif b == _ESC:
            out += bytes([_ESC, _ESC_ESC])
        else:
            out.append(b)
    out.append(_END)
    return bytes(out)


class SlipDecoder:
    def __init__(self):
        self.buf = bytearray()
        self.esc = False

    def feed(self, data):
        frames = []
        for b in data:
            if b == _END:
                if self.buf:
                    frames.append(bytes(self.buf))
                self.buf.clear()
            elif self.esc:
                self.buf.append(_END if b == _ESC_END else _ESC if b == _ESC_ESC else b)
                self.esc = False
            elif b == _ESC:
                self.esc = True
            else:
                self.buf.append(b)
        return frames


class SerialGatewayTransport(Transport):
    def __init__(self, port="/dev/ttyUSB0", baud=921600):
        try:
            import serial  # type: ignore
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("serial transport needs pyserial: pip install pyserial") from e
        self.ser = serial.Serial(port, baud, timeout=0)
        self.dec = SlipDecoder()

    def send(self, frame):
        self.ser.write(slip_encode(frame))

    def recv(self):
        data = self.ser.read(4096)
        return [f for f in self.dec.feed(data) if len(f) == PACKET_SIZE] if data else []

    def close(self):
        self.ser.close()


class LoopbackBus:
    """Every endpoint receives every frame sent by any *other* endpoint."""

    def __init__(self):
        self.endpoints = []

    def endpoint(self):
        ep = _LoopbackEndpoint(self)
        self.endpoints.append(ep)
        return ep


class _LoopbackEndpoint(Transport):
    def __init__(self, bus):
        self.bus = bus
        self.inbox = []
        self.sent = 0

    def send(self, frame):
        self.sent += 1
        for ep in self.bus.endpoints:
            if ep is not self:
                ep.inbox.append(bytes(frame))

    def recv(self):
        out, self.inbox = self.inbox, []
        return out


def make_transport(cfg):
    if cfg.transport == "udp":
        return UdpTransport(cfg.udp_broadcast, cfg.udp_port)
    if cfg.transport == "serial":
        return SerialGatewayTransport(cfg.serial_port)
    if cfg.transport == "loopback":
        return LoopbackBus().endpoint()
    raise ValueError("unknown transport %r" % cfg.transport)
