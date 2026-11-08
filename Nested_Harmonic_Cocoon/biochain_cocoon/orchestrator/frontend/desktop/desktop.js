// Cocoon Desktop shell: sign-in gate → personal desktop of add-on modules.
import { createAuth } from "./auth.js";
import { createKernel, ApiError } from "./kernel.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SIZE_LABEL = { s: "S", m: "M", l: "L", xl: "XL" };
const CATEGORY_LABEL = { overview: "Overview", session: "Sessions", insight: "Insight", mesh: "Mesh & pucks", data: "Data", system: "Hub" };

const state = { auth: null, kernel: null, me: null, catalog: {}, templates: {}, layout: null, mounted: new Map(),
                editing: false, saveTimer: null };

// ---------- gate ----------
function gate(html) { $("#gate").hidden = false; $("#desk").hidden = true; $("#gate-body").innerHTML = html; }

function showSignIn(err) {
  gate(`<button class="btn primary google" id="sign-in">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.3 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Continue with your BioChain account</button>
    ${err ? `<p class="gate-err">${esc(err)}</p>` : ""}`);
  $("#sign-in").onclick = async () => {
    try { await state.auth.signIn(); }
    catch (e) { if (e?.code !== "auth/popup-closed-by-user") showSignIn(friendlyAuthError(e)); }
  };
}

function friendlyAuthError(e) {
  if (e?.code === "auth/unauthorized-domain")
    return `This hub's address (${location.hostname}) is not an authorized domain in Firebase Authentication. ` +
           "Ask the BioChain admin to add it (Firebase console → Authentication → Settings → Authorized domains).";
  if (e?.code === "auth/network-request-failed") return "Could not reach Google sign-in. Is the hub online?";
  return e?.message || String(e);
}

// ---------- boot ----------
async function boot() {
  let config;
  try { config = await (await fetch("/api/auth/config")).json(); }
  catch { return gate(`<p class="gate-err">Cannot reach the cocoon hub.</p>`); }
  try { state.auth = await createAuth(config); }
  catch { return gate(`<p class="gate-err">Could not load the sign-in library. Sign-in needs internet access for Google.</p>`); }

  state.auth.onChange(async (user) => {
    teardown();
    if (!user) return showSignIn();
    gate(`<p class="muted">Opening your desktop…</p>`);
    state.kernel = createKernel({
      token: () => state.auth.token(),
      onUnauthorized: (why) => { teardown(); showSignIn(`The hub did not accept your sign-in${why ? `: ${why}` : ""}. Please sign in again.`); },
      toast,
    });
    try {
      state.me = await state.kernel.api("GET", "/api/me");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        gate(`<p class="gate-err">${esc(e.message)}</p><p class="muted small">Signed in as ${esc(user.email || user.uid)}.</p>
              <button class="btn" id="other">Use another account</button>`);
        $("#other").onclick = () => state.auth.signOut();
        return;
      }
      return showSignIn(e.message);
    }
    if (!state.me.picture && user.photoURL) state.me.picture = user.photoURL;
    const [mods, desk] = await Promise.all([state.kernel.api("GET", "/api/modules"), state.kernel.api("GET", "/api/desktop")]);
    state.catalog = Object.fromEntries(mods.modules.map((m) => [m.id, m]));
    state.templates = mods.templates;
    state.layout = desk.layout;
    openDesk();
    if (desk.first_run) toast(`Welcome, ${state.me.name || "friend"}. This is your cocoon desktop. Add or remove modules from Add-ons.`);
  });
}

function teardown() {
  for (const [, m] of state.mounted) unmountTile(m);
  state.mounted.clear();
  state.kernel?.stop();
  state.kernel = null;
  $("#grid").innerHTML = "";
}

// ---------- desktop ----------
function openDesk() {
  $("#gate").hidden = true;
  $("#desk").hidden = false;
  applyTheme();
  renderUser();
  renderGrid();
  state.kernel.subscribe("status", renderChips);
}

function applyTheme() {
  const t = state.layout.theme || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}

function renderChips(s) {
  if (!s) return;
  const sess = s.session;
  const room = !sess ? `<span class="chip">Cocoon idle</span>`
    : sess.mine ? `<span class="chip live">Your session · ${esc(sess.target)}</span>`
    : `<span class="chip busy">In use by another account</span>`;
  $("#chips").innerHTML = room +
    `<span class="chip">${s.clock.fe.toFixed(2)} Hz</span><span class="chip mono">${esc(s.clock.pump)}</span>` +
    `<span class="chip">${s.nodes_online} puck${s.nodes_online === 1 ? "" : "s"}</span>` +
    (s.bridge ? `<span class="chip">BioChain receipts on</span>` : "");
}

function renderUser() {
  const me = state.me, btn = $("#user-btn");
  const initials = (me.name || me.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  if (me.picture) { btn.style.backgroundImage = `url("${me.picture.replace(/"/g, "")}")`; btn.textContent = ""; }
  else { btn.style.backgroundImage = ""; btn.textContent = initials; }
  btn.setAttribute("aria-label", `Account: ${me.name || me.uid}`);
  const theme = state.layout.theme || "auto";
  $("#user-pop").innerHTML = `
    <div class="who"><b>${esc(me.name || "Local operator")}<span class="role">${esc(me.role)}</span></b>
      <span>${esc(me.email || (me.auth_mode === "none" ? "no sign-in (dev hub)" : me.uid))}</span></div>
    <button data-act="theme" role="menuitem">Theme: ${theme}</button>
    <button data-act="templates" role="menuitem">Start from a template…</button>
    ${me.auth_mode === "none" ? "" : `<button data-act="signout" role="menuitem">Sign out</button>`}`;
}

$("#user-btn").onclick = (e) => {
  e.stopPropagation();
  const pop = $("#user-pop"); pop.hidden = !pop.hidden;
  $("#user-btn").setAttribute("aria-expanded", String(!pop.hidden));
};
document.addEventListener("click", (e) => { if (!$("#user-menu").contains(e.target)) $("#user-pop").hidden = true; });
$("#user-pop").onclick = async (e) => {
  const act = e.target.closest("button")?.dataset.act;
  if (!act) return;
  $("#user-pop").hidden = true;
  if (act === "theme") {
    const order = ["auto", "dark", "light"];
    state.layout.theme = order[(order.indexOf(state.layout.theme || "auto") + 1) % 3];
    applyTheme(); renderUser(); save();
  } else if (act === "templates") openDrawer(true);
  else if (act === "signout") { teardown(); await state.auth.signOut(); }
};

function renderGrid() {
  const grid = $("#grid");
  const wanted = new Set(state.layout.modules.map((m) => m.instance));
  for (const [inst, m] of state.mounted) if (!wanted.has(inst)) { unmountTile(m); m.el.remove(); state.mounted.delete(inst); }
  state.layout.modules.forEach((item) => {
    let m = state.mounted.get(item.instance);
    if (!m) { m = mountTile(item); state.mounted.set(item.instance, m); }
    updateTileChrome(m, item);
    grid.appendChild(m.el);                                   // (re)order
  });
  $("#empty").hidden = state.layout.modules.length > 0;
  grid.classList.toggle("editing", state.editing);
}

function mountTile(item) {
  const man = state.catalog[item.id];
  const el = document.createElement("section");
  el.className = "tile";
  el.dataset.instance = item.instance;
  el.setAttribute("aria-label", man.name);
  el.innerHTML = `
    <div class="tile-head">
      <span class="drag-hint" aria-hidden="true">⋮⋮</span>
      <span class="tile-icon" aria-hidden="true">${esc(man.icon)}</span>
      <span class="tile-title">${esc(man.name)}</span>
      <div class="tile-tools">
        <div class="size-tools m-row" role="group" aria-label="Size">${man.sizes.map((s) =>
          `<button class="btn ghost" data-size="${s}" title="Size ${SIZE_LABEL[s]}">${SIZE_LABEL[s]}</button>`).join("")}</div>
        <button class="btn ghost" data-act="collapse" aria-label="Collapse"></button>
        <button class="btn ghost" data-act="remove" aria-label="Remove ${esc(man.name)} from desktop" title="Remove">✕</button>
      </div>
    </div>
    <div class="tile-body"></div>`;
  const m = { el, item, mod: null, ctx: null };
  el.querySelector(".tile-tools").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.size) { item.size = b.dataset.size; updateTileChrome(m, item); m.mod?.onResize?.(item.size); save(); }
    else if (b.dataset.act === "collapse") { item.collapsed = !item.collapsed; updateTileChrome(m, item); save(); }
    else if (b.dataset.act === "remove") removeModule(item.instance);
  };
  wireDrag(el);
  const body = el.querySelector(".tile-body");
  m.ctx = state.kernel.context({
    instance: item.instance, manifest: man, user: state.me,
    getSettings: () => ({ ...(item.settings || {}) }),
    setSettings: (patch) => { item.settings = { ...(item.settings || {}), ...patch }; save(); },
    getSize: () => item.size,
  });
  import(`../modules/${item.id}/module.js?v=${encodeURIComponent(man.version)}`)
    .then((mod) => { m.mod = mod; return mod.mount(body, m.ctx); })
    .catch((e) => { console.error(e); body.innerHTML = `<p class="tile-error">This module failed to load: ${esc(e.message)}</p>`; });
  return m;
}

function unmountTile(m) {
  try { m.mod?.unmount?.(); } catch (e) { console.error(e); }
  m.ctx?._dispose();
}

function updateTileChrome(m, item) {
  m.item = item;
  m.el.className = `tile ${item.size}${item.collapsed ? " collapsed" : ""}`;
  m.el.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("primary", b.dataset.size === item.size));
  const c = m.el.querySelector('[data-act="collapse"]');
  c.textContent = item.collapsed ? "▸" : "▾";
  c.setAttribute("aria-expanded", String(!item.collapsed));
  m.el.draggable = state.editing;
}

// ---------- arrange (drag to reorder) ----------
let dragInst = null;
function wireDrag(el) {
  el.addEventListener("dragstart", (e) => { if (!state.editing) return e.preventDefault(); dragInst = el.dataset.instance; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  el.addEventListener("dragend", () => { el.classList.remove("dragging"); document.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target")); });
  el.addEventListener("dragover", (e) => { if (dragInst && dragInst !== el.dataset.instance) { e.preventDefault(); el.classList.add("drop-target"); } });
  el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
  el.addEventListener("drop", (e) => {
    e.preventDefault(); el.classList.remove("drop-target");
    const mods = state.layout.modules;
    const from = mods.findIndex((x) => x.instance === dragInst), to = mods.findIndex((x) => x.instance === el.dataset.instance);
    if (from < 0 || to < 0) return;
    mods.splice(to, 0, mods.splice(from, 1)[0]);
    dragInst = null; renderGrid(); save();
  });
}
$("#edit-toggle").onclick = () => {
  state.editing = !state.editing;
  $("#edit-toggle").setAttribute("aria-pressed", String(state.editing));
  $("#edit-toggle").textContent = state.editing ? "Done" : "Arrange";
  $("#edit-toggle").classList.toggle("primary", state.editing);
  renderGrid();
};

// ---------- add-ons drawer ----------
function openDrawer(scrollToTemplates) {
  renderCatalog();
  $("#drawer").hidden = false; $("#scrim").hidden = false;
  if (scrollToTemplates) $("#templates").scrollIntoView({ block: "start" });
  $("#drawer-close").focus();
}
function closeDrawer() { $("#drawer").hidden = true; $("#scrim").hidden = true; }
$("#addons-open").onclick = () => openDrawer(false);
$("#empty-add").onclick = () => openDrawer(false);
$("#drawer-close").onclick = closeDrawer;
$("#scrim").onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer(); });

function renderCatalog() {
  const onDesk = new Set(state.layout.modules.map((m) => m.id));
  const groups = {};
  Object.values(state.catalog).forEach((m) => (groups[m.category] ||= []).push(m));
  $("#catalog").innerHTML = Object.keys(CATEGORY_LABEL).filter((c) => groups[c]).map((c) => `
    <h3 class="section">${CATEGORY_LABEL[c]}</h3>
    ${groups[c].map((m) => `
      <div class="addon">
        <span class="tile-icon" aria-hidden="true">${esc(m.icon)}</span>
        <div><b>${esc(m.name)}</b>${m.requires_role === "owner" ? `<span class="tag">owner</span>` : ""}<p>${esc(m.description)}</p></div>
        ${onDesk.has(m.id) && m.singleton
          ? `<button class="btn" data-remove="${m.id}">Remove</button>`
          : `<button class="btn primary" data-add="${m.id}">Add</button>`}
      </div>`).join("")}`).join("");
  $("#templates").innerHTML = Object.entries(state.templates).map(([k, t]) =>
    `<button class="btn template" data-template="${k}"><b>${esc(t.label)}</b><span>${esc(t.description)}</span></button>`).join("");
}

$("#drawer").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.add) addModule(b.dataset.add);
  else if (b.dataset.remove) removeModule(state.layout.modules.find((m) => m.id === b.dataset.remove)?.instance);
  else if (b.dataset.template) {
    if (state.layout.modules.length && !confirm("Replace your current desktop with this template?")) return;
    try {
      const r = await state.kernel.api("POST", "/api/desktop/reset", { template: b.dataset.template });
      state.layout = r.layout; renderGrid(); renderCatalog(); flashSaved();
    } catch (err) { toast(err.message, "error"); }
  }
};

function addModule(id) {
  const man = state.catalog[id];
  let n = 1;
  while (state.layout.modules.some((m) => m.instance === `${id}-${n}`)) n++;
  state.layout.modules.push({ instance: `${id}-${n}`, id, size: man.default_size, settings: {} });
  renderGrid(); renderCatalog(); save();
  const el = document.querySelector(`[data-instance="${id}-${n}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  toast(`${man.name} added to your desktop`);
}

function removeModule(instance) {
  if (!instance) return;
  state.layout.modules = state.layout.modules.filter((m) => m.instance !== instance);
  renderGrid(); if (!$("#drawer").hidden) renderCatalog(); save();
}

// ---------- persistence ----------
function save() {
  $("#save-state").textContent = "Saving…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try { await state.kernel.api("PUT", "/api/desktop", state.layout); flashSaved(); }
    catch (e) { $("#save-state").textContent = "Not saved"; toast(`Layout not saved: ${e.message}`, "error"); }
  }, 600);
}
function flashSaved() { $("#save-state").textContent = "Saved"; setTimeout(() => { if ($("#save-state").textContent === "Saved") $("#save-state").textContent = ""; }, 1800); }

// ---------- toasts ----------
function toast(msg, kind = "info") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`; t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "error" ? 7000 : 3800);
}

boot();
