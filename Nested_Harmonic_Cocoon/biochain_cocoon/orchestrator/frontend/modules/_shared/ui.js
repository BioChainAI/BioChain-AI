// Small helpers shared by desktop modules. Modules use the .m-* classes from
// desktop/theme.css, so they follow the user's theme.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];
export const BAND_RANGE = { delta: "0.5–4", theta: "4–8", alpha: "8–13", beta: "13–30", gamma: "30–45" };
export const TYPE_COLOR = { sonic_ambisonic: "var(--t1)", photonic: "var(--t2)", haptic_emdr: "var(--t3)", scalar_coil: "var(--t4)" };
export const TYPE_LABEL = { sonic_ambisonic: "Sonic", photonic: "Photonic", haptic_emdr: "Haptic", scalar_coil: "Scalar coil" };

export function meter(label, v, { violet = false, fmt = (x) => x.toFixed(2) } = {}) {
  const pct = Math.max(0, Math.min(1, v ?? 0)) * 100;
  return `<div class="m-meter"><span>${esc(label)}</span><span class="m-bar${violet ? " violet" : ""}"><i style="width:${pct}%"></i></span><span>${v == null ? "–" : fmt(v)}</span></div>`;
}
export const time = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const dateTime = (t) => new Date(t * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
export function duration(s) {
  s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min ${r}s` : `${r}s`;
}
/** Run an async action with the button disabled; toast failures. */
export async function act(ctx, btn, fn, ok) {
  if (btn) btn.disabled = true;
  try { const r = await fn(); if (ok) ctx.toast(ok); return r; }
  catch (e) { ctx.toast(e.message, "error"); }
  finally { if (btn) btn.disabled = false; }
}
