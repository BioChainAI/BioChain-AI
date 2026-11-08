import { esc, TYPE_COLOR, TYPE_LABEL, act } from "../_shared/ui.js";

const ZONES = { root: 0.0, sacral: 0.1, solar_plexus: 0.25, heart: 0.4, throat: 0.55, third_eye: 0.68, crown: 0.78 };

export function mount(root, ctx) {
  root.innerHTML = `
    <svg viewBox="-1.3 -1.3 2.6 2.6" role="img" aria-label="Top view of the body and puck positions" style="width:100%;max-height:460px;display:block;touch-action:none">
      <g stroke="var(--line)" stroke-width=".004">${Array.from({ length: 13 }, (_, i) => { const v = (-1.2 + i * 0.2).toFixed(2);
        return `<line x1="${v}" y1="-1.2" x2="${v}" y2="1.2"/><line x1="-1.2" y1="${v}" x2="1.2" y2="${v}"/>`; }).join("")}</g>
      <g transform="scale(1,-1)" fill="none" stroke="var(--dim)" stroke-width=".01">
        <ellipse cx="0" cy="0.72" rx="0.11" ry="0.13"/><rect x="-0.22" y="-0.05" width="0.44" height="0.62" rx="0.12"/>
        <rect x="-0.19" y="-0.95" width="0.16" height="0.92" rx="0.07"/><rect x="0.03" y="-0.95" width="0.16" height="0.92" rx="0.07"/>
      </g>
      <g transform="scale(1,-1)" data-k="zones">${Object.entries(ZONES).map(([z, h]) =>
        `<circle data-zone="${z}" cx="0" cy="${(h - 0.4).toFixed(3)}" r="0.032" fill="var(--violet)" opacity=".25"><title>${z.replace("_", " ")}</title></circle>`).join("")}</g>
      <g data-k="pucks"></g>
    </svg>
    <p class="small muted" data-k="hint"></p>`;
  const svg = root.querySelector("svg"), g = root.querySelector('[data-k="pucks"]');
  root.querySelector('[data-k="hint"]').textContent = ctx.isOwner
    ? "Drag a puck to where it physically sits. Positions drive spatial focus (DBAP)."
    : "Puck positions are set by a hub owner.";
  let nodes = [], dragging = null;

  function draw() {
    g.innerHTML = nodes.map((n) => {
      const [x, y] = n.pos || [0, 0, 0];
      return `<g data-node="${n.node}" transform="translate(${x},${-y})" style="cursor:${ctx.isOwner ? "grab" : "default"}">
        <circle r="0.065" fill="${n.online ? TYPE_COLOR[n.type] || "var(--faint)" : "var(--faint)"}" opacity="${n.online ? 1 : 0.45}" stroke="var(--panel)" stroke-width=".012">
          <title>#${n.node} ${esc(TYPE_LABEL[n.type] || n.type)}${n.online ? "" : " (offline)"}</title></circle>
        <text dy="0.022" text-anchor="middle" font-size=".06" fill="var(--bg)" style="pointer-events:none;font-weight:700">${n.node}</text></g>`;
    }).join("");
  }
  function toWorld(evt) {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const c = (v) => Math.max(-1.2, Math.min(1.2, v));
    return [c(p.x), c(-p.y)];
  }
  if (ctx.isOwner) {
    svg.addEventListener("pointerdown", (e) => { const n = e.target.closest("[data-node]"); if (n) { dragging = Number(n.dataset.node); svg.setPointerCapture(e.pointerId); } });
    svg.addEventListener("pointermove", (e) => {
      if (dragging == null) return;
      const n = nodes.find((k) => k.node === dragging); if (!n) return;
      const [x, y] = toWorld(e); n.pos = [x, y, (n.pos || [0, 0, 0])[2]]; draw();
    });
    svg.addEventListener("pointerup", () => {
      if (dragging == null) return;
      const n = nodes.find((k) => k.node === dragging); dragging = null;
      if (n) act(ctx, null, () => ctx.api("PUT", `/api/nodes/${n.node}/position`, { pos: n.pos.map((v) => +v.toFixed(3)) }));
    });
  }
  ctx.on("nodes", (list) => { if (dragging == null) { nodes = list; draw(); } });
  ctx.on("status", (s) => {
    const focus = s.guide?.focus;
    root.querySelectorAll("[data-zone]").forEach((c) => c.setAttribute("opacity", c.dataset.zone === focus ? "0.95" : "0.25"));
  });
}
