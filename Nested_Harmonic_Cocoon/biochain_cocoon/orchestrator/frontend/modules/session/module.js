import { esc, BANDS, BAND_RANGE, act } from "../_shared/ui.js";

const MODS = [["audio", "Sonic"], ["haptic", "Haptic"], ["photonic", "Photonic 650 nm"], ["coil", "Scalar coil (experimental)"]];

export async function mount(root, ctx) {
  const s0 = { target: "alpha", audio_mode: "isochronic", modalities: ["audio", "haptic"], profile_id: "", ...ctx.settings.get() };
  root.innerHTML = `
    <div class="m-stack">
      <div><span class="m-label">Target state</span>
        <div class="m-seg" data-k="bands">${BANDS.map((b) => `<button class="btn ${b === s0.target ? "on" : ""}" data-band="${b}">${b[0].toUpperCase() + b.slice(1)}<small>${BAND_RANGE[b]} Hz</small></button>`).join("")}</div></div>
      <label><span class="m-label">For</span><select class="m-input" data-k="profile"><option value="">Myself (no profile)</option></select></label>
      <label><span class="m-label">Audio</span><select class="m-input" data-k="audio">
        <option value="isochronic">Isochronic (room speakers)</option><option value="binaural">Binaural (headphones)</option><option value="monaural">Monaural</option></select></label>
      <div><span class="m-label">Modalities</span>${MODS.map(([v, l]) => `<label class="m-check"><input type="checkbox" value="${v}" ${s0.modalities.includes(v) ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <label class="m-check m-warn"><input type="checkbox" data-k="consent"> Light pulses at 3–60 Hz can trigger seizures in photosensitive people. Tick only if the recorded profile has given consent.</label>
      <div class="m-row"><button class="btn primary" data-a="start">Start guided session</button><button class="btn" data-a="stop">Stop</button></div>
      <p class="small muted" data-k="note"></p>
    </div>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  q("audio").value = s0.audio_mode;
  let target = s0.target;

  try {
    const profiles = await ctx.api("GET", "/api/profiles");
    q("profile").insertAdjacentHTML("beforeend", profiles.map((p) =>
      `<option value="${p.id}" ${String(p.id) === String(s0.profile_id) ? "selected" : ""}>${esc(p.name)}${p.photosensitive_consent ? " · light consent" : ""}</option>`).join(""));
  } catch { /* profiles are optional */ }

  const remember = () => ctx.settings.set({
    target, audio_mode: q("audio").value, profile_id: q("profile").value,
    modalities: [...root.querySelectorAll("input[type=checkbox][value]:checked")].map((i) => i.value),
  });
  root.addEventListener("change", remember);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.band) {
      target = b.dataset.band;
      root.querySelectorAll("[data-band]").forEach((x) => x.classList.toggle("on", x === b));
      remember();
    } else if (b.dataset.a === "start") {
      const mods = [...root.querySelectorAll("input[type=checkbox][value]:checked")].map((i) => i.value);
      act(ctx, b, () => ctx.api("POST", "/api/session/start", {
        target, audio_mode: q("audio").value, modalities: mods,
        photosensitive_consent: q("consent").checked,
        profile_id: q("profile").value ? Number(q("profile").value) : null,
      }), `Guided ${target} session started`).then(() => ctx.refresh("status"));
    } else if (b.dataset.a === "stop") {
      act(ctx, b, () => ctx.api("POST", "/api/session/stop", {}), "Fading out").then(() => ctx.refresh("status"));
    }
  });
  ctx.on("status", (s) => {
    const sess = s.session;
    q("note").textContent = !sess ? "" : sess.mine ? `Running: ${sess.target}. Starting again replaces it.`
      : "The cocoon is in use by another account. You can stop it for safety, but not start one.";
    root.querySelector('[data-a="start"]').disabled = !!sess && !sess.mine;
  });
}
