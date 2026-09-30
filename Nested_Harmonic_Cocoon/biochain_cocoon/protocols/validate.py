#!/usr/bin/env python3
"""
Minimal JSON-Schema validator (standard library only) for the schemas in
./schemas. It supports the subset those schemas use: type, required,
properties, additionalProperties, enum, const, minimum/maximum,
exclusiveMaximum, minItems/maxItems, uniqueItems, items, pattern,
propertyNames, oneOf and maxLength.

    python3 protocols/validate.py                       # validate every preset
    python3 protocols/validate.py schema.json doc.json  # validate one document

The cocoon has no third-party dependency here on purpose, so it stays standalone.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMAS = os.path.join(HERE, "schemas")
_TYPES = {
    "object": dict, "array": list, "string": str, "boolean": bool,
    "integer": int, "number": (int, float), "null": type(None),
}


def _is_type(v, t):
    if isinstance(t, list):
        return any(_is_type(v, x) for x in t)
    if t in ("integer", "number") and isinstance(v, bool):
        return False
    if t == "integer" and isinstance(v, float):
        return v.is_integer()
    return isinstance(v, _TYPES[t])


def errors(schema, doc, path="$"):
    """Yield human-readable error strings; empty iterator means valid."""
    if "type" in schema and not _is_type(doc, schema["type"]):
        yield "%s: expected %s" % (path, schema["type"])
        return
    if "const" in schema and doc != schema["const"]:
        yield "%s: must equal %r" % (path, schema["const"])
    if "enum" in schema and doc not in schema["enum"]:
        yield "%s: %r not in %r" % (path, doc, schema["enum"])
    if "oneOf" in schema:
        n = sum(1 for s in schema["oneOf"] if not list(errors(s, doc, path)))
        if n != 1:
            yield "%s: matches %d of oneOf (need exactly 1)" % (path, n)
    if isinstance(doc, (int, float)) and not isinstance(doc, bool):
        if "minimum" in schema and doc < schema["minimum"]:
            yield "%s: %s < minimum %s" % (path, doc, schema["minimum"])
        if "maximum" in schema and doc > schema["maximum"]:
            yield "%s: %s > maximum %s" % (path, doc, schema["maximum"])
        if "exclusiveMaximum" in schema and doc >= schema["exclusiveMaximum"]:
            yield "%s: %s >= exclusiveMaximum %s" % (path, doc, schema["exclusiveMaximum"])
    if isinstance(doc, str):
        if "pattern" in schema and not re.search(schema["pattern"], doc):
            yield "%s: %r does not match %s" % (path, doc, schema["pattern"])
        if "maxLength" in schema and len(doc) > schema["maxLength"]:
            yield "%s: longer than %d" % (path, schema["maxLength"])
    if isinstance(doc, list):
        if "minItems" in schema and len(doc) < schema["minItems"]:
            yield "%s: fewer than %d items" % (path, schema["minItems"])
        if "maxItems" in schema and len(doc) > schema["maxItems"]:
            yield "%s: more than %d items" % (path, schema["maxItems"])
        if schema.get("uniqueItems") and len({json.dumps(x, sort_keys=True) for x in doc}) != len(doc):
            yield "%s: items not unique" % path
        if "items" in schema:
            for i, item in enumerate(doc):
                yield from errors(schema["items"], item, "%s[%d]" % (path, i))
    if isinstance(doc, dict):
        for k in schema.get("required", []):
            if k not in doc:
                yield "%s: missing required %r" % (path, k)
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for k, v in doc.items():
            if "propertyNames" in schema:
                yield from errors(schema["propertyNames"], k, "%s.<key %s>" % (path, k))
            if k in props:
                yield from errors(props[k], v, "%s.%s" % (path, k))
            elif extra is False:
                yield "%s: unexpected property %r" % (path, k)
            elif isinstance(extra, dict):
                yield from errors(extra, v, "%s.%s" % (path, k))


def load_schema(name):
    with open(os.path.join(SCHEMAS, name)) as f:
        return json.load(f)


def validate(schema_name, doc):
    """Return a list of errors (empty list = valid)."""
    return list(errors(load_schema(schema_name), doc))


def main(argv):
    if len(argv) == 3:
        with open(argv[1]) as f:
            schema = json.load(f)
        with open(argv[2]) as f:
            doc = json.load(f)
        errs = list(errors(schema, doc))
        for e in errs:
            print("  " + e)
        print("VALID" if not errs else "INVALID (%d)" % len(errs))
        return 1 if errs else 0

    preset_dir = os.path.join(HERE, "..", "standalone_presets")
    schema = load_schema("standalone_preset.schema.json")
    bad = 0
    for fn in sorted(os.listdir(preset_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(preset_dir, fn)) as f:
            errs = list(errors(schema, json.load(f)))
        print("  [%s] %s" % ("PASS" if not errs else "FAIL", fn))
        for e in errs:
            print("        " + e)
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
