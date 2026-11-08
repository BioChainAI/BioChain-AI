import { esc, time } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <div class="m-row" style="justify-content:space-between;margin-bottom:6px">
      <span class="small muted">Newest first</span>
      <label class="m-check small"><input type="checkbox" data-k="cmds"> include commands</label>
    </div>
    <ol class="m-list m-scroll" data-k="log" aria-live="polite"><li class="m-empty">The Guide's reasoning appears here during your sessions.</li></ol>`;
  const list = root.querySelector('[data-k="log"]');
  const box = root.querySelector('[data-k="cmds"]');
  box.checked = !!ctx.settings.get().showCommands;
  box.onchange = () => { ctx.settings.set({ showCommands: box.checked }); list.innerHTML = ""; render(ctx.latest("events")); };

  function line(e) {
    if (e.kind === "guide") return `<b>${esc(e.payload.rationale)}</b><div class="small muted">rung ${e.payload.rung} · d<sub>H</sub> ${Number(e.payload.distance).toFixed(3)}</div>`;
    if (e.kind === "command") {
      if (!box.checked) return null;
      const c = e.payload;
      return `<span class="muted">${esc(c.source || "command")}: ${esc((c.modality || []).join("+") || c.cmd)} ${c.fe != null ? `fe ${c.fe}` : ""} ${c.amp != null ? `amp ${c.amp}` : ""}</span>`;
    }
    return `<span style="color:var(--accent)">${esc(e.payload.msg || e.kind)}</span>`;
  }
  function render(batch) {
    let added = false;
    for (const e of batch) {
      const html = line(e); if (!html) continue;
      if (!added && list.querySelector(".m-empty")) list.innerHTML = "";
      added = true;
      const li = document.createElement("li");
      li.innerHTML = `<span class="small muted mono">${time(e.t)}</span> ${html}`;
      list.prepend(li);
    }
    while (list.children.length > 200) list.lastChild.remove();
  }
  ctx.on("events", render);
}
