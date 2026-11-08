import os
import unittest

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend import COCOON_ROOT
from cocoon_backend.auth import Principal
from cocoon_backend.desktop import ModuleCatalog, TEMPLATES

MODULES = os.path.join(COCOON_ROOT, "orchestrator", "frontend", "modules")
MEMBER = Principal(uid="m", email=None, name=None, picture=None, role="member")
OWNER = Principal(uid="o", email=None, name=None, picture=None, role="owner")


class Catalog(unittest.TestCase):
    def test_every_module_folder_is_valid(self):
        c = ModuleCatalog(MODULES)
        self.assertEqual(c.errors, {})
        self.assertEqual(len(c.modules), 11)

    def test_templates_reference_real_modules(self):
        c = ModuleCatalog(MODULES)
        for name, t in TEMPLATES.items():
            for mid, size in t["modules"]:
                self.assertIn(mid, c.modules, name)
                self.assertIn(size, c.modules[mid]["sizes"], "%s/%s" % (name, mid))
            c.check_layout(c.template_layout(name, MEMBER), MEMBER)

    def test_broken_module_is_quarantined(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "good"))
            os.makedirs(os.path.join(d, "bad"))
            man = {"id": "good", "name": "Good", "version": "1.0.0", "description": "x", "category": "system",
                   "icon": "*", "entry": "module.js", "default_size": "m"}
            json.dump(man, open(os.path.join(d, "good", "module.json"), "w"))
            open(os.path.join(d, "good", "module.js"), "w").write("export function mount(){}")
            json.dump(dict(man, id="bad"), open(os.path.join(d, "bad", "module.json"), "w"))   # no module.js
            c = ModuleCatalog(d)
            self.assertEqual(list(c.modules), ["good"])
            self.assertIn("module.js missing", c.errors["bad"])


if __name__ == "__main__":
    unittest.main()
