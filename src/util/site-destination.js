// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI. Extends siteDestination() from Owl-Academy login.html (MIT, Copyright (c)
// 2026 Ebayednoob); see NOTICE.
/**
 * Site destination — where a page may send the browser when the target comes
 * from outside the page (login.html?redirect=...).
 * ----------------------------------------------------------------------------
 * The site is the folder that holds the page (on GitHub Pages,
 * https://biochainai.github.io/BioChain-AI/). Other apps share that origin
 * (https://biochainai.github.io/Owl-Academy/), so a target must stay under the
 * site's folder, not merely on the same origin. The value is resolved with the
 * WHATWG URL parser, as the browser resolves it when it navigates (tabs and
 * newlines removed, leading and trailing spaces trimmed, backslashes read as
 * slashes, dot segments and %2e dot segments resolved), and is accepted only when
 *   - the scheme is http: or https: and equals the page's, and the origin equals
 *     the page's (javascript:, data:, vbscript:, blob:, //host and other hosts are
 *     refused),
 *   - it carries no user name or password,
 *   - its path starts with the site's folder and has no encoded slash or
 *     backslash (%2f, %5c), which a server could decode into a path outside it,
 *   - it is not the page itself ("?x", "#x" or the page's own name would
 *     reload the sign-in page, or leave it waiting, instead of moving on).
 * An empty or missing value, a value that does not parse, and anything refused
 * give the fallback, resolved against the page.
 *
 * Firebase-free and DOM-free, so Node can test it (tests/unit/site-destination.test.mjs).
 */

const WEB = new Set(["http:", "https:"]);
const ENCODED_SEPARATOR = /%2f|%5c/i;

/**
 * @param {unknown} value   the requested target (absolute or relative to the page)
 * @param {string} page     the page's own URL (location.href)
 * @param {string} fallback where to go instead, relative to the page
 * @returns {string} an absolute URL on the site
 */
export function siteDestination(value, page, fallback) {
  const pageUrl = new URL(page);
  const site = new URL(".", pageUrl);
  const fallbackHref = new URL(fallback, pageUrl).href;
  if (typeof value !== "string" || value.trim() === "") return fallbackHref;
  let dest;
  try { dest = new URL(value, pageUrl); } catch { return fallbackHref; }
  return isOnSite(dest, site, pageUrl) ? dest.href : fallbackHref;
}

function isOnSite(dest, site, pageUrl) {
  return WEB.has(site.protocol)
    && dest.protocol === site.protocol
    && dest.origin === site.origin
    && dest.username === "" && dest.password === ""
    && dest.pathname.startsWith(site.pathname)
    && !ENCODED_SEPARATOR.test(dest.pathname)
    && dest.pathname !== pageUrl.pathname;
}
