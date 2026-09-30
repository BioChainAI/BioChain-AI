// Harmonic Cocoon Control Suite: vanilla JS, no build step, talks to /api.
"use strict";

const $ = (s) => document.querySelector(s);
const ZONES = { root: 0.0, sacral: 0.1, solar_plexus: 0.25, heart: 0.4, throat: 0.55, third_eye: 0.68, crown: 0.78 };
const TYPE_CLASS = { sonic_ambisonic: "t1", photonic: "t2", haptic_emdr: "t3", scalar_coil: "t4" };
const state = { band: "alpha", since: 0, dragging: null, nodes: [] };

let token = "";
try { token = localStorage.getItem("cocoon.token") || ""; } catch (_) { /* storage unavailable */ }
$("#token").value = token;
$("#token").addEventListener("change", (e) => {
  token = e.target.value;
  try { localStorage.setItem("cocoon.token", token); } catch (_) { /* ignore */ }
});

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
function showErr(e) { $("#err").textContent = e ? String(e.message || e) : ""; }
const guard = (fn) => async (...a) => { try { showErr(""); await fn(...a); } catch (e) { showErr(e); } };

// ---------- session controls ----------
$("#bands").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.band = b.dataset.band;
  document.querySelectorAll("#bands button").forEach((x) => x.classList.toggle("on", x === b));
});
$("#start").addEventListener("click", guard(async () => {
  const mods = [...document.querySelectorAll("input[name=mod]:checked")].map((i) => i.value);
  const pid = $("#profile").value ? Number($("#profile").value) : null;
  await api("POST", "/api/session/start", {
    target: state.band, audio_mode: $("#audio-mode").value, modalities: mods,
    photosensitive_consent: $("#consent").checked, profile_id: pid,
  });
}));
$("#stop").addEventListener("click", guard(() => api("POST", "/api/session/stop", {})));
$("#halt").addEventListener("click", guard(() => api("POST", "/api/stop_all", { fade_ms: 3000 })));
$("#new-profile").addEventListener("click", guard(async () => {
  const name = prompt("Profile name"); if (!name) return;
  await api("POST", "/api/profiles", { name }); await loadProfiles();
}));
$("#consent").addEventListener("change", guard(async (e) => {
  const pid = $("#profile").value;
  if (pid) await api("PUT", `/api/profiles/${pid}/consent`, { photosensitive_consent: e.target.checked });
}));

async function loadProfiles() {
  const ps = await api("GET", "/api/profiles");
  const sel = $("#profile"), cur = sel.value;
  sel.innerHTML = '<option value="">(anonymous)</option>' +
    ps.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  sel.value = cur;
}
async function loadPresets() {
  const ps = await api("GET", "/api/presets");
  $("#presets").innerHTML = ps.map((p) => `
    <li><span>${escapeHtml(p.name)}<small>${escapeHtml(p.target_state || "")} · ~${p.duration_hint_min ?? "?"} min${p.photosensitive_consent_required ? " · needs light consent" : ""}</small></span>
    <button data-play="${p.id}">Play</button></li>`).join("");
}
$("#presets").addEventListener("click", guard(async (e) => {
  const id = e.target.dataset.play; if (id) await api("POST", `/api/presets/${id}/play`, {});
}));

// ---------- manual override ----------
for (const [id, fmt] of [["fc", (v) => v], ["fe", (v) => Number(v).toFixed(2)], ["amp", (v) => Number(v).toFixed(2)], ["ramp", (v) => v]]) {
  const inp = $("#" + id), out = $("#" + id + "-o");
  inp.addEventListener("input", () => { out.textContent = fmt(inp.value); });
}
$("#send").addEventListener("click", guard(async () => {
  const mod = $("#m-mod").value;
  await api("POST", "/api/command", {
    cmd: "update_geo", fc: Number($("#fc").value), fe: Number($("#fe").value), amp: Number($("#amp").value),
    ramp_ms: Math.round(Number($("#ramp").value) * 1000), modality: [mod],
    mode: mod === "audio" ? $("#audio-mode").value : mod === "haptic" ? "bilateral" : "pulse",
    photosensitive_consent: $("#consent").checked,
  });
}));

// ---------- spatial mapper ----------
const svg = $("#map");
(function drawGrid() {
  let g = "";
  for (let v = -1.2; v <= 1.21; v += 0.2) {
    g += `<line x1="${v}" y1="-1.2" x2="${v}" y2="1.2"/><line x1="-1.2" y1="${v}" x2="1.2" y2="${v}"/>`;
  }
  $("#grid").innerHTML = g;
  $("#zones").innerHTML = Object.entries(ZONES).map(([z, h]) =>
    `<circle class="zone" data-zone="${z}" cx="0" cy="${(h - 0.4).toFixed(3)}" r="0.035"><title>${z}</title></circle>`).join("");
})();

function toWorld(evt) {
  const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const clamp = (v) => Math.max(-1.2, Math.min(1.2, v));
  return [clamp(p.x), clamp(-p.y)];
}
function renderPucks() {
  $("#pucks").innerHTML = state.nodes.map((n) => {
    const [x, y] = n.pos || [0, 0, 0];
    const cls = n.online ? TYPE_CLASS[n.type] || "off" : "off";
    return `<g class="puck" data-node="${n.node}" transform="translate(${x},${-y})">
      <circle r="0.06" class="${cls}"><title>#${n.node} ${n.type}${n.standalone ? " (standalone)" : ""}
phase err ${(n.phase_error_rad ?? 0).toFixed(4)} rad · ${n.temperature_c ?? "?"} °C</title></circle>
      <text dy="0.02">${n.node}</text></g>`;
  }).join("");
}
svg.addEventListener("pointerdown", (e) => {
  const g = e.target.closest(".puck"); if (!g) return;
  state.dragging = Number(g.dataset.node); svg.setPointerCapture(e.pointerId);
});
svg.addEventListener("pointermove", (e) => {
  if (state.dragging == null) return;
  const [x, y] = toWorld(e);
  const n = state.nodes.find((k) => k.node === state.dragging);
  if (n) { n.pos = [x, y, (n.pos || [0, 0, 0])[2]]; renderPucks(); }
});
svg.addEventListener("pointerup", guard(async () => {
  if (state.dragging == null) return;
  const n = state.nodes.find((k) => k.node === state.dragging); state.dragging = null;
  if (n) await api("PUT", `/api/nodes/${n.node}/position`, { pos: n.pos.map((v) => +v.toFixed(3)) });
}));

// ---------- polling ----------
function meter(label, v, fmt = (x) => x.toFixed(2)) {
  const pct = Math.max(0, Math.min(1, v ?? 0)) * 100;
  return `<div class="meter"><span>${label}</span><span class="bar"><i style="width:${pct}%"></i></span><span>${v == null ? "–" : fmt(v)}</span></div>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function pollStatus() {
  const s = await api("GET", "/api/status");
  const live = !!s.session;
  $("#pill-session").textContent = live ? `session · ${s.session.target}` : "idle";
  $("#pill-session").classList.toggle("live", live);
  $("#pill-clock").textContent = `${s.clock.fe.toFixed(2)} Hz`;
  $("#pill-pump").textContent = s.clock.pump;
  $("#pill-nodes").textContent = `${s.nodes_online} pucks`;
  $("#pill-bridge").hidden = !s.bridge;
  const b = s.biostate;
  $("#meters").innerHTML = meter("calm", b?.calm) + meter("arousal", b?.arousal) + meter("depth", b?.depth);
  const bands = b?.bands || {};
  const tot = Object.values(bands).reduce((a, x) => a + x, 0) || 1;
  $("#bandbars").innerHTML = ["delta", "theta", "alpha", "beta", "gamma"].map((k) => meter(k, (bands[k] || 0) / tot)).join("");
  const g = s.guide;
  $("#guide-kv").innerHTML = g ? `
    <dt>policy</dt><dd>${escapeHtml(g.policy)}</dd><dt>entrainment</dt><dd>${g.fe?.toFixed(2) ?? "–"} Hz</dd>
    <dt>carrier</dt><dd>${g.fc} Hz</dd><dt>support rung</dt><dd>${g.rung} / 3</dd>
    <dt>zone focus</dt><dd>${g.focus || "–"}</dd><dt>manual hold</dt><dd>${s.manual_hold_s} s</dd>` : "";
  document.querySelectorAll(".zone").forEach((z) => z.classList.toggle("focus", g && z.dataset.zone === g.focus));
  const aura = $("#aura-c"); aura.setAttribute("r", String(0.5 + 0.6 * (b?.calm ?? 0.5)));
}
async function pollNodes() {
  if (state.dragging != null) return;
  state.nodes = await api("GET", "/api/nodes"); renderPucks();
}
async function pollEvents() {
  const evs = await api("GET", `/api/events?since=${state.since}`);
  const log = $("#log");
  for (const e of evs) {
    state.since = Math.max(state.since, e.id);
    let text;
    if (e.kind === "guide") text = e.payload.rationale;
    else if (e.kind === "command") text = `${e.payload.source || "cmd"}: ${e.payload.modality || ""} fe ${e.payload.fe ?? ""} amp ${e.payload.amp ?? ""}`;
    else text = e.payload.msg || JSON.stringify(e.payload);
    if (e.kind === "command" && e.payload.source === "guide") continue;   // rationale already shown
    const li = document.createElement("li");
    li.className = "k-" + e.kind;
    li.innerHTML = `<time>${new Date(e.t * 1000).toLocaleTimeString()}</time>${escapeHtml(text)}`;
    log.prepend(li);
  }
  while (log.children.length > 200) log.lastChild.remove();
}
function loop(fn, ms) { const run = async () => { try { await fn(); } catch (e) { showErr(e); } setTimeout(run, ms); }; run(); }

loadProfiles().catch(showErr);
loadPresets().catch(showErr);
loop(pollStatus, 1000);
loop(pollNodes, 2000);
loop(pollEvents, 1500);
