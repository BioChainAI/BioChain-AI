import { esc, act } from "../_shared/ui.js";

export async function mount(root, ctx) {
  root.innerHTML = `<ul class="m-list" data-k="list"><li class="m-empty">Loading presets…</li></ul>`;
  const list = root.querySelector('[data-k="list"]');
  let busy = false;
  const presets = await ctx.api("GET", "/api/presets");
  list.innerHTML = presets.map((p) => `
    <li class="m-row" style="justify-content:space-between;flex-wrap:nowrap">
      <span style="min-width:0"><b>${esc(p.name)}</b>
        <span class="small muted" style="display:block">${esc(p.target_state || "")} · ~${p.duration_hint_min ?? "?"} min${p.loop ? " · loops" : ""}${p.photosensitive_consent_required ? ` · <span class="m-warn">light consent</span>` : ""}</span></span>
      <button class="btn" data-play="${p.id}" title="${esc(p.description)}">Play</button>
    </li>`).join("");
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-play]"); if (!b) return;
    act(ctx, b, () => ctx.api("POST", `/api/presets/${b.dataset.play}/play`, {}), "Preset sent to every puck");
  });
  ctx.on("status", (s) => {
    const nowBusy = !!s.session && !s.session.mine;
    if (nowBusy === busy) return;
    busy = nowBusy;
    root.querySelectorAll("[data-play]").forEach((b) => { b.disabled = busy; });
  });
}
