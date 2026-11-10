// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
// site-destination.js: which ?redirect= values login.html follows. The site is
// the folder that holds login.html (/BioChain-AI/ on GitHub Pages, an origin
// shared with Owl-Academy); every other value ends on the default page. Also
// checks login.html itself: its one redirect value goes through the guard and
// every navigation uses the checked value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteDestination } from "../../src/util/site-destination.js";

const ORIGIN = "https://biochainai.github.io";
const SITE = `${ORIGIN}/BioChain-AI/`;
const PAGE = `${SITE}login.html`;
const DEFAULT = "console/Operations_Console.html";
const DEFAULT_HREF = `${SITE}${DEFAULT}`;
const go = (value, page = PAGE) => siteDestination(value, page, DEFAULT);

test("relative paths inside the site are followed", () => {
  assert.equal(go("console/Language_Studio.html"), `${SITE}console/Language_Studio.html`);
  assert.equal(go("console/Operations_Console.html"), DEFAULT_HREF);
  assert.equal(go("index.html"), `${SITE}index.html`);
  assert.equal(go("console/guides/Lattice_Forge_Guide.html?x=1#top"), `${SITE}console/guides/Lattice_Forge_Guide.html?x=1#top`);
  assert.equal(go("The Geometric Engine/Geometric_Calculator.html"), `${SITE}The%20Geometric%20Engine/Geometric_Calculator.html`);
  assert.equal(go("The%20Geometric%20Engine/Geometric_Calculator.html"), `${SITE}The%20Geometric%20Engine/Geometric_Calculator.html`);
});

test("./ and ../ that stay inside the site are followed", () => {
  assert.equal(go("./console/Lattice_Forge.html"), `${SITE}console/Lattice_Forge.html`);
  assert.equal(go("./console/./Operations_Console.html"), DEFAULT_HREF);
  assert.equal(go("console/guides/../Language_Studio.html"), `${SITE}console/Language_Studio.html`);
  assert.equal(go("console/../index.html"), `${SITE}index.html`);
  assert.equal(go("./"), SITE);
  // the site is the page's folder: from a page in console/, ../console/ comes back in, ../ alone leaves it
  const deep = `${SITE}console/login.html`;
  assert.equal(siteDestination("../console/Language_Studio.html", deep, "Operations_Console.html"), `${SITE}console/Language_Studio.html`);
  assert.equal(siteDestination("../index.html", deep, "Operations_Console.html"), `${SITE}console/Operations_Console.html`);
});

test("absolute paths and URLs on the site are followed", () => {
  // what src/ui/auth-guard.js sends: location.pathname + location.search
  assert.equal(go("/BioChain-AI/console/Language_Studio.html"), `${SITE}console/Language_Studio.html`);
  assert.equal(go("/BioChain-AI/console/Language_Studio.html?tab=recall"), `${SITE}console/Language_Studio.html?tab=recall`);
  assert.equal(go("/BioChain-AI/"), SITE);
  assert.equal(go(`${SITE}console/Lattice_Forge.html`), `${SITE}console/Lattice_Forge.html`);
  assert.equal(go("https://BIOCHAINAI.github.io:443/BioChain-AI/index.html"), `${SITE}index.html`);
  assert.equal(go("/BioChain-AI/console/../index.html"), `${SITE}index.html`);
  // "https:evil.com" with the page's own scheme is a relative path (WHATWG URL); it stays on the site
  assert.equal(go("https:evil.com"), `${SITE}evil.com`);
});

test("javascript:, data: and vbscript: go to the default, in any case and with tabs, newlines or leading spaces", () => {
  const values = [
    "javascript:alert(document.domain)", "JavaScript:alert(1)", "JAVASCRIPT:alert(1)", "jAvAsCrIpT:alert(1)",
    " javascript:alert(1)", "   javascript:alert(1)", "\tjavascript:alert(1)", "\njavascript:alert(1)", "\r\njavascript:alert(1)",
    "java\tscript:alert(1)", "java\nscript:alert(1)", "java\rscript:alert(1)", "javascript\t:alert(1)", "j\na\tv\na\tscript:alert(1)",
    "\x00javascript:alert(1)", "\x01\x1fjavascript:alert(1)", "javascript:alert(1)\n ", "javascript://%0aalert(1)",
    `javascript:location="${SITE}"`, "javascript:/BioChain-AI/",
    "data:text/html,<script>alert(1)</script>", "DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    " data:text/html,x", "\tda\nta:text/html,x", "Data:,", "data:/BioChain-AI/",
    "vbscript:msgbox(1)", "VBScript:msgbox(1)", "VBSCRIPT:msgbox(1)", " vbscript:msgbox(1)", "vb\tscript:msgbox(1)", "\nvbscript:msgbox(1)",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
});

test("other schemes go to the default, including those whose origin is the site's", () => {
  const values = [
    `blob:${ORIGIN}/0b7e2a4c-1b7e-4a5e-9a35-3c1d1d7c9d10`, // origin is the site's origin; scheme is blob:
    `filesystem:${ORIGIN}/temporary/x.html`, "file:///etc/passwd", "ftp://biochainai.github.io/BioChain-AI/",
    "about:blank", "mailto:a@example.com", "http://biochainai.github.io/BioChain-AI/index.html", "ws://biochainai.github.io/BioChain-AI/",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
});

test("other hosts go to the default: //host, /\\host, \\\\host, look-alike hosts and user info", () => {
  const values = [
    "//evil.com", "//evil.com/BioChain-AI/console/Operations_Console.html", "///evil.com", "////evil.com",
    "/\\evil.com", "/\\evil.com/BioChain-AI/", "\\\\evil.com", "\\/evil.com", "\\\\evil.com/BioChain-AI/",
    " //evil.com", "\t//evil.com", "/\t/evil.com", "/\n/evil.com",
    "https://evil.com", "https://evil.com/BioChain-AI/console/Operations_Console.html", "HTTPS://EVIL.COM",
    "https:/evil.com", "https:\\\\evil.com", "http:evil.com",
    "https://biochainai.github.io.evil.com", "https://biochainai.github.io.evil.com/BioChain-AI/",
    "https://biochainai.github.io./BioChain-AI/index.html", "https://evil.github.io/BioChain-AI/",
    "https://biochainai.github.io:8443/BioChain-AI/index.html",
    "https://biochainai.github.io@evil.com/BioChain-AI/", "https://user:pw@biochainai.github.io/BioChain-AI/index.html",
    "https://user@biochainai.github.io/BioChain-AI/index.html",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
});

test("other apps on the same origin go to the default (Owl-Academy shares biochainai.github.io)", () => {
  const values = [
    `${ORIGIN}/Owl-Academy/Learning-Hub.html`, `${ORIGIN}/Owl-Academy/login.html?redirect=x`, `${ORIGIN}/`, ORIGIN,
    "/Owl-Academy/Learning-Hub.html", "/", "/BioChain-AI", "/BioChain-AIX/index.html", "/biochain-ai/index.html",
    "/BioChain-AI/../Owl-Academy/", "/BioChain-AI/../Owl-Academy/Learning-Hub.html", "/BioChain-AI/./../Owl-Academy/",
    "../Owl-Academy/Learning-Hub.html", "console/../../Owl-Academy/", "./../Owl-Academy/", "..", "../",
    "/BioChain-AI/console/../../Owl-Academy/", "/BioChain-AI/..\\Owl-Academy/", "..\\Owl-Academy/",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
});

test("percent-encoded dot segments and separators that leave the site go to the default", () => {
  const values = [
    "/BioChain-AI/%2e%2e/Owl-Academy/", "/BioChain-AI/%2E%2E/Owl-Academy/", "/BioChain-AI/.%2e/Owl-Academy/",
    "/BioChain-AI/%2e./Owl-Academy/", "%2e%2e/Owl-Academy/", ".%2E/Owl-Academy/Learning-Hub.html",
    "console/%2e%2e/%2e%2e/Owl-Academy/", "/BioChain-AI/console/%2e%2e/%2E%2E/Owl-Academy/",
    // encoded slash or backslash: the browser keeps them, a server that decodes them would step out
    "/BioChain-AI/..%2fOwl-Academy/", "/BioChain-AI/..%2FOwl-Academy/", "/BioChain-AI/..%5cOwl-Academy/",
    "/BioChain-AI/..%5COwl-Academy/", "..%2fOwl-Academy/", "console%2f..%2f..%2fOwl-Academy/",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
  // dot segments that resolve inside the site are still followed
  assert.equal(go("/BioChain-AI/console/%2e%2e/index.html"), `${SITE}index.html`);
  assert.equal(go("console/%2e/Language_Studio.html"), `${SITE}console/Language_Studio.html`);
  // a doubly encoded dot is an ordinary name on the site, not a dot segment
  assert.equal(go("/BioChain-AI/%252e%252e/Owl-Academy/"), `${SITE}%252e%252e/Owl-Academy/`);
});

test("empty and missing values, and the sign-in page itself, go to the default", () => {
  const values = [
    null, undefined, "", " ", "\t", "\n", "   \t\n", "\x00",
    "?redirect=javascript:alert(1)", "?", "#", "#top", "login.html", "./login.html?redirect=x",
    "/BioChain-AI/login.html", `${PAGE}#x`, "console/../login.html?redirect=index.html",
  ];
  for (const v of values) assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
  // non-strings (URLSearchParams.get only returns string | null, but the guard does not rely on it)
  for (const v of [0, 42, {}, [], ["/BioChain-AI/index.html"], { toString: () => "/BioChain-AI/index.html" }, true]) {
    assert.equal(go(v), DEFAULT_HREF, String(v));
  }
});

test("values that do not parse go to the default", () => {
  for (const v of ["http://[", "https://exa mple.com/", "http://%zz/", "https://[::1/", "http://a:99999/"]) {
    assert.equal(go(v), DEFAULT_HREF, JSON.stringify(v));
  }
});

test("the site is the page's folder: served from a local server or from /, the same rule holds", () => {
  const local = "http://127.0.0.1:9300/BioChain-AI/login.html";
  assert.equal(siteDestination("/BioChain-AI/index.html", local, DEFAULT), "http://127.0.0.1:9300/BioChain-AI/index.html");
  assert.equal(siteDestination("/Owl-Academy/", local, DEFAULT), "http://127.0.0.1:9300/BioChain-AI/console/Operations_Console.html");
  assert.equal(siteDestination("http://127.0.0.1:9301/BioChain-AI/index.html", local, DEFAULT), "http://127.0.0.1:9300/BioChain-AI/console/Operations_Console.html");
  assert.equal(siteDestination("http://localhost:9300/BioChain-AI/index.html", local, DEFAULT), "http://127.0.0.1:9300/BioChain-AI/console/Operations_Console.html");
  // a site at the origin's root (a custom domain) may use the whole origin
  const root = "https://example.org/login.html";
  assert.equal(siteDestination("/console/Language_Studio.html", root, DEFAULT), "https://example.org/console/Language_Studio.html");
  assert.equal(siteDestination("javascript:alert(1)", root, DEFAULT), "https://example.org/console/Operations_Console.html");
  assert.equal(siteDestination("//evil.com", root, DEFAULT), "https://example.org/console/Operations_Console.html");
});

test("a page that is not on http(s) follows nothing but the fallback", () => {
  // file: and other opaque origins compare equal ("null") to javascript: and data:, so only http(s) pages accept a value
  const file = "file:///srv/BioChain-AI/login.html";
  for (const v of ["javascript:alert(1)", "data:text/html,x", "index.html", "file:///srv/BioChain-AI/index.html"]) {
    assert.equal(siteDestination(v, file, DEFAULT), "file:///srv/BioChain-AI/console/Operations_Console.html", v);
  }
});

test("the result is always a string URL on the site", () => {
  const samples = ["console/Language_Studio.html", "javascript:alert(1)", "//evil.com", null, "/BioChain-AI/%2e%2e/x"];
  for (const v of samples) {
    const out = go(v);
    assert.equal(typeof out, "string");
    const u = new URL(out);
    assert.equal(u.origin, ORIGIN);
    assert.ok(u.pathname.startsWith("/BioChain-AI/"), out);
  }
});

test("login.html: the redirect parameter goes through siteDestination and every navigation uses the checked value", () => {
  const html = readFileSync(new URL("../../login.html", import.meta.url), "utf8");
  const script = html.slice(html.indexOf('<script type="module">'));
  assert.match(script, /import \{ siteDestination \} from "\.\/src\/util\/site-destination\.js";/);
  // the only read of the parameter is the guarded one, with the default destination as the fallback
  assert.equal(script.match(/params\.get\(/g).length, 1);
  assert.match(script, /const dest = siteDestination\(params\.get\("redirect"\), location\.href, "console\/Operations_Console\.html"\);/);
  assert.equal((script.match(/\bdest\s*=/g) || []).length, 1, "dest is assigned once");
  // navigation sinks take dest and nothing else
  const sinks = [...script.matchAll(/location\.(?:replace|assign)\(([^)]*)\)|location(?:\.href)?\s*=(?!=)\s*([^;\n]*)|window\.open\(([^)]*)\)|href="\$\{([^}]*)\}"/g)];
  assert.ok(sinks.length >= 2, "login.html has its two location.replace calls");
  for (const m of sinks) {
    const arg = (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
    assert.ok(arg === "dest" || arg === "esc(dest)", `navigation with ${arg}`);
  }
});
