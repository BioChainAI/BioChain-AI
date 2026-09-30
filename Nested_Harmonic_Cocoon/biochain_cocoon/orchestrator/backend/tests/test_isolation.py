"""
Static guarantees that only the user's credentials cross from BioChain into the cocoon.
"""
import glob
import os
import re
import unittest

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend import COCOON_ROOT

FRONTEND = os.path.join(COCOON_ROOT, "orchestrator", "frontend")
BACKEND = os.path.join(COCOON_ROOT, "orchestrator", "backend", "cocoon_backend")


def read_all(pattern):
    for p in glob.glob(pattern, recursive=True):
        with open(p, encoding="utf-8") as f:
            yield os.path.relpath(p, COCOON_ROOT), f.read()


class CredentialsOnly(unittest.TestCase):
    def test_frontend_loads_only_firebase_app_and_auth(self):
        sdk = set()
        for path, text in read_all(os.path.join(FRONTEND, "**", "*.js")):
            sdk |= set(re.findall(r"firebase-([a-z-]+)\.js", text))
            for banned in ("firestore", "firebase-storage", "firebase-database", "getFirestore", "getStorage"):
                self.assertNotIn(banned, text, "%s mentions %s" % (path, banned))
        self.assertEqual(sdk, {"app", "auth"})

    def test_frontend_never_reaches_into_the_biochain_repo(self):
        for path, text in read_all(os.path.join(FRONTEND, "**", "*.*")):
            self.assertNotRegex(text, r"""["'](\.\./){2,}src/""", path)
            self.assertNotIn("/src/firebase/", text, path)
            self.assertNotIn("/src/identity/", text, path)
        for path, text in read_all(os.path.join(FRONTEND, "**", "*.js")):
            for m in re.findall(r"""import\s*\(?\s*[`'"]([^`'"]+)""", text):
                self.assertTrue(m.startswith(("./", "../", "https://www.gstatic.com/firebasejs/", "${SDK}")) or m.startswith("`"),
                                "%s imports %s" % (path, m))

    def test_backend_reads_no_biochain_data(self):
        """Code (not prose): no Firebase/Google-Cloud data SDKs, no BioChain collections or paths."""
        import ast
        banned = ("firestore", "rolegrants", "rootadmins", "identity-registry", "signingkeys", "firebase_admin",
                  "google.cloud", "googleapis.com/v1/projects")
        for path, text in read_all(os.path.join(BACKEND, "*.py")):
            tree = ast.parse(text)
            docstrings = {id(n.body[0].value) for n in ast.walk(tree)
                          if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef)) and n.body
                          and isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant)}
            tokens = []
            for n in ast.walk(tree):
                if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings:
                    tokens.append(n.value)
                elif isinstance(n, ast.Name):
                    tokens.append(n.id)
                elif isinstance(n, ast.Attribute):
                    tokens.append(n.attr)
                elif isinstance(n, (ast.Import, ast.ImportFrom)):
                    tokens += [a.name for a in n.names] + [getattr(n, "module", None) or ""]
            code = " ".join(tokens).lower()
            for b in banned:
                self.assertNotIn(b, code, "%s uses %s" % (path, b))

    def test_only_token_identity_fields_are_used(self):
        with open(os.path.join(BACKEND, "auth.py")) as f:
            text = f.read()
        used = set(re.findall(r"""claims\.get\("([a-z_]+)"\)|claims\["([a-z_]+)"\]""", text))
        fields = {a or b for a, b in used}
        self.assertLessEqual(fields, {"aud", "iss", "exp", "iat", "auth_time", "sub", "email", "email_verified",
                                      "name", "picture"})


if __name__ == "__main__":
    unittest.main()
