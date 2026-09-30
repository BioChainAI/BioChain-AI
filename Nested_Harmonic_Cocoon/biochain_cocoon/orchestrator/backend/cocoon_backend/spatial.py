"""
Spatial fan-out: distance-based amplitude panning (DBAP).

The system spec asks the orchestrator to "calculate the complex ambisonic
phasing required for full-body immersion". Pucks sit at arbitrary positions
around and under the user. That rules out a regular speaker array, and with
it true higher-order ambisonics. DBAP handles irregular layouts:

    d_i = sqrt(|s − p_i|² + r²)        (r = spatial blur, avoids singularities)
    g_i = 1 / d_i^a                    (a = rolloff exponent; 1 ≈ 6 dB/doubling)
    g_i ← g_i / max_j g_j              (loudest puck receives the requested amp)

With no source position, all pucks get the plain command: a uniform,
enveloping field. Stereo pucks also get a pan toward the source.
"""
import math


def dbap_gains(source, positions, rolloff=1.0, blur=0.2):
    if not positions:
        return []
    raw = []
    for p in positions:
        d2 = sum((a - b) ** 2 for a, b in zip(source, p)) + blur * blur
        raw.append(1.0 / (math.sqrt(d2) ** rolloff))
    m = max(raw)
    return [g / m for g in raw]


def stereo_pan(source, node_pos, width=0.5):
    return max(-1.0, min(1.0, (source[0] - node_pos[0]) / width))


def fan_out(cmd_json, nodes):
    """Yield (node_id or None, update_geo dict). None means broadcast."""
    pos = cmd_json.get("pos")
    if not pos or not nodes:
        yield None, cmd_json
        return
    gains = dbap_gains(pos, [n.get("pos", (0, 0, 0)) for n in nodes])
    for n, g in zip(nodes, gains):
        d = dict(cmd_json)
        d["amp"] = round(cmd_json["amp"] * g, 4)
        d["pan"] = round(stereo_pan(pos, n.get("pos", (0, 0, 0))), 3)
        yield n["node"], d
