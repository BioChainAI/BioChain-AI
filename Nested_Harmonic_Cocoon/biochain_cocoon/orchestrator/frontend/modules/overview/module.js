import { esc, duration, act } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <div class="ov">
      <div class="ov-hero">
        <div class="ov-ring" aria-hidden="true"><i></i><i></i></div>
        <div>
          <div class="ov-greet">Hello, ${esc((ctx.user.name || "").split(" ")[0] || "there")}</div>
          <div class="ov-state" data-k="state">…</div>
          <div class="m-row" style="margin-top:10px" data-k="actions"></div>
        </div>
      </div>
      <div class="m-stats" data-k="stats"></div>
    </div>
    <style>
      .ov { display: grid; gap: 18px; }
      .ov-hero { display: flex; gap: 18px; align-items: center; }
      .ov-ring { position: relative; width: 74px; height: 74px; flex: none; }
      .ov-ring i { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--accent); opacity: .7; }
      .ov-ring i + i { inset: 14px; border-color: var(--violet); }
      .ov-ring.on i { animation: ovpulse var(--ovp, 1s) ease-in-out infinite; }
      .ov-ring.on i + i { animation-delay: calc(var(--ovp, 1s) / -2); }
      @keyframes ovpulse { 0%,100% { transform: scale(.92); opacity: .45 } 50% { transform: scale(1.04); opacity: 1 } }
      @media (prefers-reduced-motion: reduce) { .ov-ring.on i { animation: none; } }
      .ov-greet { font-size: 18px; font-weight: 650; }
      .ov-state { color: var(--dim); }
    </style>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  let last = null;

  ctx.on("status", (s) => {
    last = s;
    const sess = s.session, ring = root.querySelector(".ov-ring");
    ring.classList.toggle("on", !!sess);
    ring.style.setProperty("--ovp", `${Math.max(0.4, Math.min(4, 4 / Math.max(s.clock.fe, 0.25)))}s`);
    q("state").innerHTML = !sess ? "The cocoon is idle and ready."
      : sess.mine ? `Your <b>${esc(sess.target)}</b> session is running · ${duration(s.time - sess.started)}`
      : `Another account's session is running (${esc(sess.target)}). Only stop is available to you.`;
    const actions = q("actions");
    const sig = sess ? (sess.mine ? "mine" : "busy") : "idle";
    if (actions.dataset.sig !== sig) {
      actions.dataset.sig = sig;
      const quick = ctx.settings.get().quickTarget || "alpha";
      actions.innerHTML = sig === "idle"
        ? `<button class="btn primary" data-a="start">Start ${esc(quick)} session</button>
           <select class="m-input" data-a="quick" style="width:auto">${["delta","theta","alpha","beta","gamma"].map((b) => `<option ${b === quick ? "selected" : ""}>${b}</option>`).join("")}</select>`
        : `<button class="btn danger" data-a="stop">Stop session</button>`;
    }
    const g = s.guide, b = s.biostate;
    q("stats").innerHTML = [
      [s.clock.fe.toFixed(2) + " Hz", "entrainment clock"],
      [esc(s.clock.pump), "pump sector"],
      [String(s.nodes_online), "pucks online"],
      [g ? `${g.rung} / 3` : "–", "Guide support rung"],
      [b ? Math.round(b.calm * 100) + "%" : "–", "calm"],
      [String(s.stats.pi6), "pi6 syncs sent"],
    ].map(([v, l]) => `<div class="m-stat"><b class="${l === "pump sector" ? "mono" : ""}">${v}</b><span>${l}</span></div>`).join("");
  });

  root.addEventListener("change", (e) => {
    if (e.target.dataset.a === "quick") {
      ctx.settings.set({ quickTarget: e.target.value });
      const b = root.querySelector('[data-a="start"]'); if (b) b.textContent = `Start ${e.target.value} session`;
    }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "start") {
      const target = ctx.settings.get().quickTarget || "alpha";
      act(ctx, b, () => ctx.api("POST", "/api/session/start", { target, modalities: ["audio", "haptic"] }),
          `Starting a ${target} session`).then(() => ctx.refresh("status"));
    } else if (b.dataset.a === "stop") {
      act(ctx, b, () => ctx.api("POST", "/api/session/stop", {}), "Fading out").then(() => ctx.refresh("status"));
    }
  });
  return last;
}
