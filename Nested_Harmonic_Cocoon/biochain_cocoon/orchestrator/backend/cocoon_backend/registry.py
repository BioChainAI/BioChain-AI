"""Live puck registry, fed by Announce/Telemetry packets; positions come from the spatial mapper."""
import threading

from .shdccp import NODE_TYPE, FLAG_STANDALONE, modality_names

STALE_S = 10.0


class NodeRegistry:
    def __init__(self, store=None):
        self._nodes = {}
        self._lock = threading.Lock()
        self.store = store
        self._positions = dict(store.node_positions()) if store else {}

    def on_announce(self, pkt, now):
        with self._lock:
            n = self._nodes.setdefault(pkt.node, {"node": pkt.node})
            n.update({
                "type": NODE_TYPE.get(pkt.aux, "unknown"),
                "modality": modality_names(pkt.modality),
                "phase_error_rad": round(pkt.phase, 5),
                "temperature_c": round(pkt.amp, 1),
                "standalone": bool(pkt.flags & FLAG_STANDALONE),
                "last_seen": now,
            })
            n["pos"] = list(self._positions.get(pkt.node, (0.0, 0.0, 0.0)))

    def set_position(self, node, pos, label=None):
        with self._lock:
            self._positions[node] = tuple(float(v) for v in pos)
            if node in self._nodes:
                self._nodes[node]["pos"] = list(self._positions[node])
        if self.store:
            self.store.save_node_position(node, self._positions[node], label)

    def nodes(self, now=None, include_stale=True):
        with self._lock:
            out = []
            for n in self._nodes.values():
                d = dict(n)
                d["online"] = now is None or (now - n.get("last_seen", 0)) < STALE_S
                if include_stale or d["online"]:
                    out.append(d)
            return sorted(out, key=lambda d: d["node"])

    def by_modality(self, modality, now):
        return [n for n in self.nodes(now, include_stale=False) if modality in n.get("modality", [])]
