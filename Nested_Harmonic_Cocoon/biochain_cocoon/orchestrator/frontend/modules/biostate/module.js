import { meter, BANDS, esc } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `<div class="m-stack" data-k="body"><p class="m-empty">Waiting for data…</p></div>`;
  ctx.on("status", (s) => {
    const body = root.querySelector('[data-k="body"]');
    const b = s.biostate;
    if (!s.session) { body.innerHTML = `<p class="m-empty">No session running. Your biostate appears here during your sessions.</p>`; return; }
    if (!s.session.mine) { body.innerHTML = `<p class="m-empty">Another account's session is running. Their biostate is private.</p>`; return; }
    if (!b || !b.sources.length) { body.innerHTML = `<p class="m-empty">Session running. Waiting for a wearable to send biofeedback.</p>`; return; }
    const tot = BANDS.reduce((a, k) => a + (b.bands[k] || 0), 0) || 1;
    const compact = ctx.size() === "s";
    body.innerHTML = `
      ${meter("calm", b.calm)}${meter("arousal", b.arousal)}${meter("depth", b.depth)}
      ${compact ? "" : `<span class="m-label" style="margin-top:6px">EEG band balance · dominant <b>${esc(b.dominant)}</b></span>
        ${BANDS.map((k) => meter(k, (b.bands[k] || 0) / tot, { violet: true })).join("")}`}
      <dl class="m-kv small">
        <dt>RMSSD</dt><dd>${b.rmssd_ms != null ? b.rmssd_ms.toFixed(0) + " ms" : "–"}</dd>
        <dt>Heart rate</dt><dd>${b.hr_bpm != null ? b.hr_bpm.toFixed(0) + " bpm" : "–"}</dd>
        <dt>Sources</dt><dd>${esc(b.sources.join(", "))}</dd>
      </dl>`;
  });
}
export function onResize() { /* re-rendered on next status tick */ }
