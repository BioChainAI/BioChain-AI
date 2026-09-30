import { esc, TYPE_COLOR, TYPE_LABEL } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <div class="m-stats" data-k="sum" style="margin-bottom:12px"></div>
    <div class="m-scroll"><table class="m-table">
      <thead><tr><th>Puck</th><th>Type</th><th>Link</th><th>pi6 corr.</th><th>Temp</th><th>Seen</th></tr></thead>
      <tbody data-k="rows"><tr><td colspan="6" class="m-empty">No pucks have announced yet.</td></tr></tbody></table></div>`;
  let stats = null;
  ctx.on("status", (s) => { stats = s.stats; });
  ctx.on("nodes", (nodes) => {
    const now = Date.now() / 1000;
    const online = nodes.filter((n) => n.online).length;
    const worst = nodes.reduce((m, n) => Math.max(m, Math.abs(n.phase_error_rad || 0)), 0);
    root.querySelector('[data-k="sum"]').innerHTML = `
      <div class="m-stat"><b>${online}/${nodes.length}</b><span>pucks online</span></div>
      <div class="m-stat"><b>${(worst * 180 / Math.PI).toFixed(2)}°</b><span>largest pi6 correction</span></div>
      <div class="m-stat"><b>${stats ? stats.rejected : "–"}</b><span>frames rejected</span></div>`;
    if (!nodes.length) return;
    root.querySelector('[data-k="rows"]').innerHTML = nodes.map((n) => {
      const hot = (n.temperature_c ?? 0) >= 40;
      return `<tr>
        <td><span class="m-dot" style="background:${TYPE_COLOR[n.type] || "var(--faint)"}"></span>#${n.node}</td>
        <td>${esc(TYPE_LABEL[n.type] || n.type)}</td>
        <td>${!n.online ? `<span class="m-danger">offline</span>` : n.standalone ? `<span class="m-warn">standalone</span>` : `<span class="m-ok">mesh</span>`}</td>
        <td>${((n.phase_error_rad || 0) * 180 / Math.PI).toFixed(2)}°</td>
        <td class="${hot ? "m-warn" : ""}">${n.temperature_c != null ? n.temperature_c.toFixed(1) + " °C" : "–"}</td>
        <td>${n.last_seen ? Math.max(0, Math.round(now - n.last_seen)) + " s ago" : "–"}</td></tr>`;
    }).join("");
  });
}
