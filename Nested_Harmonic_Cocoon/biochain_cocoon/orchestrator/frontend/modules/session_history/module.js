import { esc, dateTime, duration, act } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <div class="m-row" style="justify-content:flex-end;margin-bottom:6px"><button class="btn ghost" data-a="reload">Refresh</button></div>
    <div class="m-scroll"><table class="m-table"><thead><tr><th>Started</th><th>Target</th><th>Length</th><th>Receipt</th></tr></thead>
      <tbody data-k="rows"></tbody></table></div>
    <div data-k="receipt" hidden style="margin-top:12px"></div>`;
  const rows = root.querySelector('[data-k="rows"]'), rc = root.querySelector('[data-k="receipt"]');
  async function load() {
    const ss = await ctx.api("GET", "/api/sessions");
    rows.innerHTML = ss.length ? ss.map((s) => `<tr>
      <td>${dateTime(s.started)}</td><td>${esc(s.target_band || "–")}</td>
      <td>${s.ended ? duration(s.ended - s.started) : `<span class="m-ok">running</span>`}</td>
      <td>${s.ended ? `<button class="btn ghost" data-receipt="${s.id}">View</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="4" class="m-empty">No sessions yet.</td></tr>`;
  }
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "reload") return act(ctx, b, load);
    if (b.dataset.copy) {
      await navigator.clipboard.writeText(rc.querySelector("textarea").value).then(() => ctx.toast("Engram text copied"), () => ctx.toast("Copy failed", "error"));
      return;
    }
    if (!b.dataset.receipt) return;
    rc.hidden = false;
    try {
      const r = await ctx.api("GET", `/api/sessions/${b.dataset.receipt}/receipt`);
      const c = r.receipt.coherence;
      rc.innerHTML = `
        <dl class="m-kv small">
          <dt>Coherence d<sub>H</sub></dt><dd>${c.start.toFixed(3)} → ${c.end.toFixed(3)} (best ${c.min_distance.toFixed(3)})</dd>
          <dt>Pump ticks</dt><dd>${r.receipt.pump_ticks}</dd>
          <dt>XOR holonomy</dt><dd class="mono">${esc(r.receipt.xor_holonomy)}</dd>
          <dt>Kernel check</dt><dd>${r.receipt.kernel_verified ? `<span class="m-ok">verified against BioChain kernel</span>` : "not cross-checked"}</dd>
        </dl>
        <span class="m-label" style="margin-top:8px">Engram text: paste into the BioChain console's Lattice Forge to publish it under your own key</span>
        <textarea class="m-input mono small" rows="5" readonly>${esc(r.engram_text || "")}</textarea>
        <div class="m-row" style="margin-top:6px"><button class="btn" data-copy="1">Copy engram text</button></div>`;
    } catch (err) {
      rc.innerHTML = `<p class="small muted">${esc(err.message)}. Receipts are produced only when the BioChain bridge is enabled on this hub.</p>`;
    }
  });
  load().catch((e) => { rows.innerHTML = `<tr><td colspan="4" class="m-danger">${esc(e.message)}</td></tr>`; });
}
