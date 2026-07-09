/**
 * Epoch Service — the timing anchor for signing keys and attestations.
 * ----------------------------------------------------------------------------
 * Produces a deterministic, window-based `epoch` token so keys created in the
 * same window share a temporal cohort. The default clock is purely local
 * (no external dependency): the token is `EPOCH.<windowId>`, derived from the
 * wall clock divided into fixed cadence windows.
 *
 * An optional geomagnetic enrichment (NOAA SWPC planetary K-index) can be layered
 * on for metadata only — it NEVER changes the token, and it soft-fails to the
 * local clock when offline. Firebase-free → the pure `computeEpoch` math is
 * unit-testable in Node.
 */

const CADENCE_MS = 3 * 60 * 60 * 1000;   // 3-hour windows
export const NOAA_KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

/**
 * Pure: turn a timestamp into a deterministic epoch. The `token` depends ONLY on
 * the window id, so it is stable offline and identical for anything created in
 * the same window. `kp`/`amplitude` are optional metadata and never affect the token.
 */
export function computeEpoch({ now = Date.now(), cadenceMs = CADENCE_MS, kp = null, source = "local-clock" } = {}) {
  const windowId = Math.floor(now / cadenceMs);
  const phase = +(((now % cadenceMs) / cadenceMs) * 2 * Math.PI).toFixed(4);
  const k = kp == null ? null : Math.max(0, Math.min(9, Number(kp)));
  const amplitude = k == null ? 1 : +(1 + k / 3).toFixed(3);
  const token = `EPOCH.${windowId}`;
  return { windowId, phase, kp: k, amplitude, token, source, ts: new Date(now).toISOString() };
}

/** Pure: parse the SWPC Kp product (array of rows, first row is a header). */
export function parseLatestKp(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const kp = parseFloat(last[1]);
  return Number.isFinite(kp) ? kp : null;
}

let _cache = null;                       // { epoch, fetchedAt }
const FRESH_MS = 5 * 60 * 1000;

/**
 * Live epoch. Local clock by default. If `enrich` is true, tries to attach the
 * NOAA Kp as metadata (soft-fails to local — the token is unaffected either way).
 */
export async function getEpoch({ force = false, enrich = false } = {}) {
  if (!force && _cache && Date.now() - _cache.fetchedAt < FRESH_MS) return _cache.epoch;
  let kp = null, source = "local-clock";
  if (enrich) {
    try {
      const res = await fetch(NOAA_KP_URL, { cache: "no-store" });
      if (res.ok) { kp = parseLatestKp(await res.json()); if (kp != null) source = "noaa-swpc-kp"; }
    } catch (_) { /* offline → local clock; token is identical regardless */ }
  }
  const epoch = computeEpoch({ kp, source });
  _cache = { epoch, fetchedAt: Date.now() };
  return epoch;
}

/** A short human label for header readouts. */
export function epochLabel(e) {
  const geo = e.kp == null ? "local" : `Kp ${e.kp}`;
  return `win ${e.windowId} · ${geo} · ${e.source === "noaa-swpc-kp" ? "NOAA" : "local"}`;
}
