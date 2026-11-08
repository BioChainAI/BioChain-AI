import { act } from "../_shared/ui.js";

export function mount(root, ctx) {
  const s = { fc: 432, fe: 10, amp: 0.3, ramp: 5, modality: "audio", ...ctx.settings.get() };
  root.innerHTML = `
    <div class="m-stack">
      <label><span class="m-label">Carrier <output data-o="fc">${s.fc}</output> Hz</span><input type="range" data-k="fc" min="40" max="1000" step="1" value="${s.fc}"></label>
      <label><span class="m-label">Entrainment <output data-o="fe">${s.fe}</output> Hz</span><input type="range" data-k="fe" min="0.5" max="45" step="0.01" value="${s.fe}"></label>
      <label><span class="m-label">Amplitude <output data-o="amp">${s.amp}</output></span><input type="range" data-k="amp" min="0" max="0.8" step="0.01" value="${s.amp}"></label>
      <label><span class="m-label">Glide <output data-o="ramp">${s.ramp}</output> s</span><input type="range" data-k="ramp" min="0.25" max="60" step="0.25" value="${s.ramp}"></label>
      <label><span class="m-label">Modality</span><select class="m-input" data-k="modality">
        <option value="audio">Sonic</option><option value="photonic">Photonic</option><option value="haptic">Haptic</option><option value="coil">Scalar coil</option></select></label>
      <label class="m-check m-warn small"><input type="checkbox" data-k="consent"> Photosensitive consent recorded for this person</label>
      <div class="m-row"><button class="btn" data-a="send">Send</button><button class="btn danger" data-a="fade">Fade all out</button></div>
      <p class="small muted">Sending pauses the AI Guide for 30 s. The pucks still apply every safety limit.</p>
    </div>`;
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  q("modality").value = s.modality;
  root.addEventListener("input", (e) => {
    const k = e.target.dataset.k; const o = root.querySelector(`[data-o="${k}"]`);
    if (o) o.textContent = e.target.value;
  });
  root.addEventListener("change", () => ctx.settings.set({ fc: +q("fc").value, fe: +q("fe").value, amp: +q("amp").value, ramp: +q("ramp").value, modality: q("modality").value }));
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "send") {
      const mod = q("modality").value;
      act(ctx, b, () => ctx.api("POST", "/api/command", {
        cmd: "update_geo", fc: +q("fc").value, fe: +q("fe").value, amp: +q("amp").value,
        ramp_ms: Math.round(+q("ramp").value * 1000), modality: [mod],
        mode: mod === "audio" ? "isochronic" : mod === "haptic" ? "bilateral" : "pulse",
        photosensitive_consent: q("consent").checked,
      }), "Sent. Guide paused for 30 s");
    } else if (b.dataset.a === "fade") {
      act(ctx, b, () => ctx.api("POST", "/api/stop_all", { fade_ms: 3000 }), "Fading every puck out");
    }
  });
}
