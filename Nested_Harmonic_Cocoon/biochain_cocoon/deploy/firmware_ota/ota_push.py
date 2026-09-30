#!/usr/bin/env python3
"""
Push firmware Over-The-Air to one puck or a whole fleet (ESP32 ArduinoOTA /
"espota" protocol, standard library only).

    # one puck
    python3 deploy/firmware_ota/ota_push.py --node cocoon-biopuck-audio.local \
        --firmware firmware/nodes/biopuck_audio/.pio/build/esp32s3/firmware.bin

    # a fleet, staged: canary first, then the rest only if the canary comes back
    python3 deploy/firmware_ota/ota_push.py --fleet deploy/firmware_ota/fleet.example.json --type biopuck_audio

Pucks accept OTA only when they were built with Wi-Fi credentials (ArduinoOTA
runs in arduino_node.h). Set OTA_PASSWORD in the environment if the fleet uses one.

Protocol: UDP invitation to device:3232 "0 <port> <size> <md5>", optional
MD5 challenge/response, then the device connects back over TCP and receives
the image in 1460-byte chunks, acknowledging each one.
"""
import argparse
import hashlib
import json
import os
import socket
import sys
import time

FLASH, AUTH = 0, 200
CHUNK = 1460


def md5hex(b):
    return hashlib.md5(b).hexdigest()


def push(host, firmware_path, port=3232, password=None, timeout=10.0, log=print):
    with open(firmware_path, "rb") as f:
        image = f.read()
    size, digest = len(image), md5hex(image)
    remote = socket.gethostbyname(host)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", 0))
    srv.listen(1)
    local_port = srv.getsockname()[1]

    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.settimeout(timeout)
    invite = ("%d %d %d %s\n" % (FLASH, local_port, size, digest)).encode()
    for attempt in range(3):
        udp.sendto(invite, (remote, port))
        try:
            reply = udp.recv(64).decode(errors="replace").strip()
            break
        except socket.timeout:
            log("  no answer from %s (attempt %d)" % (host, attempt + 1))
    else:
        raise RuntimeError("device did not answer the OTA invitation")

    if reply.startswith("AUTH"):
        if not password:
            raise RuntimeError("device requires OTA_PASSWORD")
        nonce = reply.split()[1]
        cnonce = md5hex(("%s%u%s%s" % (os.path.basename(firmware_path), size, digest, remote)).encode())
        result = md5hex(("%s:%s:%s" % (md5hex(password.encode()), nonce, cnonce)).encode())
        udp.sendto(("%d %s %s\n" % (AUTH, cnonce, result)).encode(), (remote, port))
        reply = udp.recv(64).decode(errors="replace").strip()
    if reply != "OK":
        raise RuntimeError("device refused OTA: %r" % reply)

    srv.settimeout(timeout)
    conn, _ = srv.accept()
    conn.settimeout(timeout)
    sent = 0
    t0 = time.time()
    try:
        while sent < size:
            chunk = image[sent:sent + CHUNK]
            conn.sendall(chunk)
            sent += len(chunk)
            conn.recv(32)                                     # per-chunk ack (byte count)
            pct = 100 * sent // size
            if pct % 10 == 0:
                print("  %s: %3d%%" % (host, pct), end="\r" if pct < 100 else "\n")
        deadline = time.time() + 30
        tail = b""
        while b"OK" not in tail and time.time() < deadline:
            tail += conn.recv(64)
        if b"OK" not in tail:
            raise RuntimeError("device did not confirm the image (MD5 mismatch or flash error)")
    finally:
        conn.close()
        srv.close()
        udp.close()
    log("  %s: %d bytes in %.1fs, rebooting" % (host, size, time.time() - t0))


def wait_online(host, port=3232, timeout=60):
    """A rebooted puck re-registers mDNS; resolving the name again is a cheap liveness probe."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            socket.gethostbyname(host)
            return True
        except OSError:
            time.sleep(2)
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--node", help="hostname or IP of one puck")
    ap.add_argument("--firmware", help="path to firmware.bin")
    ap.add_argument("--fleet", help="fleet JSON (see fleet.example.json)")
    ap.add_argument("--type", help="only push to this node type from the fleet file")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    password = os.environ.get("OTA_PASSWORD")

    if a.node:
        if not a.firmware:
            ap.error("--firmware is required with --node")
        if a.dry_run:
            print("would push %s → %s" % (a.firmware, a.node))
            return 0
        push(a.node, a.firmware, password=password)
        return 0

    if not a.fleet:
        ap.error("give --node or --fleet")
    with open(a.fleet) as f:
        fleet = json.load(f)
    root = os.path.dirname(os.path.abspath(a.fleet))
    failures = 0
    for group in fleet["groups"]:
        if a.type and group["type"] != a.type:
            continue
        fw = os.path.normpath(os.path.join(root, group["firmware"]))
        hosts = group["hosts"]
        print("[%s] %d puck(s), image %s" % (group["type"], len(hosts), fw))
        if a.dry_run:
            for h in hosts:
                print("  would push → %s" % h)
            continue
        canary, rest = hosts[0], hosts[1:]
        try:
            push(canary, fw, password=password)
        except Exception as e:
            print("  canary %s FAILED: %s; halting this group" % (canary, e))
            failures += 1
            continue
        if not wait_online(canary):
            print("  canary %s did not come back; halting this group" % canary)
            failures += 1
            continue
        for h in rest:
            try:
                push(h, fw, password=password)
            except Exception as e:
                print("  %s FAILED: %s" % (h, e))
                failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
