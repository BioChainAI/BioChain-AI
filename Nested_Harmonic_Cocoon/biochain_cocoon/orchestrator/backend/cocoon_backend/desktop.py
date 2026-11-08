"""
Cocoon Desktop: the module catalog and per-user layouts.

Modules live in orchestrator/frontend/modules/<id>/ with a module.json
manifest (protocols/schemas/desktop_module.schema.json) and a module.js ES
module. The catalog is read from disk at startup, so adding a module is
"drop a folder in and restart". No registry, and no BioChain involvement.
"""
import copy
import json
import os

import validate as schema

TEMPLATES = {
    "personal": {
        "label": "Personal cocoon",
        "description": "Your sessions, your state, your presets.",
        "modules": [("overview", "xl"), ("session", "m"), ("biostate", "m"), ("presets", "m"),
                    ("guide_log", "xl")],
    },
    "practitioner": {
        "label": "Practitioner",
        "description": "Run guided sessions for a client, with override and full insight.",
        "modules": [("overview", "xl"), ("session", "m"), ("biostate", "m"), ("profiles", "m"),
                    ("spatial_mapper", "l"), ("guide_log", "l"), ("manual_override", "l"), ("presets", "l")],
    },
    "engineer": {
        "label": "Mesh engineer",
        "description": "Puck health, placement, sync and raw control.",
        "modules": [("overview", "xl"), ("mesh_health", "l"), ("spatial_mapper", "l"),
                    ("manual_override", "l"), ("session_history", "l")],
    },
}
DEFAULT_TEMPLATE = "personal"
MAX_SETTINGS_BYTES = 8192


class ModuleCatalog:
    def __init__(self, modules_dir):
        self.dir = modules_dir
        self.modules = {}
        self.errors = {}
        self.reload()

    def reload(self):
        self.modules, self.errors = {}, {}
        if not os.path.isdir(self.dir):
            return
        for name in sorted(os.listdir(self.dir)):
            path = os.path.join(self.dir, name, "module.json")
            if name.startswith("_") or not os.path.isfile(path):
                continue
            try:
                with open(path) as f:
                    m = json.load(f)
            except ValueError as e:
                self.errors[name] = ["invalid JSON: %s" % e]
                continue
            errs = schema.validate("desktop_module.schema.json", m)
            if m.get("id") != name:
                errs.append("id %r must equal its folder name %r" % (m.get("id"), name))
            if not os.path.isfile(os.path.join(self.dir, name, "module.js")):
                errs.append("module.js missing")
            if errs:
                self.errors[name] = errs
                continue
            m.setdefault("sizes", ["s", "m", "l", "xl"])
            m.setdefault("requires_role", "member")
            m.setdefault("singleton", True)
            m.setdefault("uses", [])
            self.modules[name] = m

    def visible_to(self, principal):
        return [m for m in self.modules.values()
                if m["requires_role"] == "member" or principal.is_owner()]

    def template_layout(self, name, principal):
        t = TEMPLATES.get(name) or TEMPLATES[DEFAULT_TEMPLATE]
        allowed = {m["id"] for m in self.visible_to(principal)}
        mods = [{"instance": "%s-1" % mid, "id": mid, "size": size, "settings": {}}
                for mid, size in t["modules"] if mid in allowed]
        return {"version": 1, "theme": "auto", "density": "comfortable", "modules": mods}

    def check_layout(self, layout, principal):
        """Validate a layout PUT by the user. Returns a cleaned copy or raises ValueError."""
        errs = schema.validate("desktop_layout.schema.json", layout)
        if errs:
            raise ValueError("; ".join(errs[:5]))
        allowed = {m["id"]: m for m in self.visible_to(principal)}
        seen_instances, seen_singletons = set(), set()
        out = copy.deepcopy(layout)
        for item in out["modules"]:
            m = allowed.get(item["id"])
            if not m:
                raise ValueError("module %r is not installed on this hub or not permitted" % item["id"])
            if not item["instance"].startswith(item["id"] + "-"):
                raise ValueError("instance %r does not belong to module %r" % (item["instance"], item["id"]))
            if item["instance"] in seen_instances:
                raise ValueError("duplicate instance %r" % item["instance"])
            if m["singleton"] and item["id"] in seen_singletons:
                raise ValueError("module %r can only be placed once" % item["id"])
            if item["size"] not in m["sizes"]:
                raise ValueError("module %r does not support size %r" % (item["id"], item["size"]))
            if len(json.dumps(item.get("settings", {}))) > MAX_SETTINGS_BYTES:
                raise ValueError("settings for %r exceed %d bytes" % (item["instance"], MAX_SETTINGS_BYTES))
            seen_instances.add(item["instance"])
            seen_singletons.add(item["id"])
        return out
