import { esc, dateTime, act } from "../_shared/ui.js";

export function mount(root, ctx) {
  root.innerHTML = `
    <form class="m-row" data-k="form" style="margin-bottom:10px;flex-wrap:nowrap">
      <input class="m-input" data-k="name" placeholder="New profile name" maxlength="80" aria-label="New profile name">
      <button class="btn primary" type="submit">Add</button></form>
    <ul class="m-list" data-k="list"></ul>
    <p class="small muted">Profiles are private to your account on this hub.</p>`;
  const list = root.querySelector('[data-k="list"]');
  async function load() {
    const ps = await ctx.api("GET", "/api/profiles");
    list.innerHTML = ps.length ? ps.map((p) => `
      <li><div class="m-row" style="justify-content:space-between"><b>${esc(p.name)}</b>
        <label class="m-check small"><input type="checkbox" data-consent="${p.id}" ${p.photosensitive_consent ? "checked" : ""}> light consent</label></div>
        <span class="small muted">${p.photosensitive_consent ? `consent recorded ${dateTime(p.photosensitive_consent_at)}` : "no light consent: pulsed light stays off"}</span></li>`).join("")
      : `<li class="m-empty">No profiles yet.</li>`;
  }
  root.querySelector('[data-k="form"]').onsubmit = (e) => {
    e.preventDefault();
    const inp = root.querySelector('[data-k="name"]'); const name = inp.value.trim(); if (!name) return;
    act(ctx, null, async () => { await ctx.api("POST", "/api/profiles", { name }); inp.value = ""; await load(); }, "Profile added");
  };
  list.addEventListener("change", (e) => {
    const id = e.target.dataset.consent; if (!id) return;
    if (e.target.checked && !confirm("Confirm this person has read the photosensitivity warning and consents to pulsed light at 3–60 Hz.")) {
      e.target.checked = false; return;
    }
    act(ctx, null, async () => { await ctx.api("PUT", `/api/profiles/${id}/consent`, { photosensitive_consent: e.target.checked }); await load(); },
        e.target.checked ? "Consent recorded" : "Consent withdrawn");
  });
  load().catch((e) => { list.innerHTML = `<li class="m-danger">${esc(e.message)}</li>`; });
}
