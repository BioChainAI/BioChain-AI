import { esc, dateTime } from "../_shared/ui.js";

export async function mount(root, ctx) {
  root.innerHTML = `<div class="m-scroll"><table class="m-table"><thead><tr><th>Account</th><th>Role</th><th>Last sign-in</th></tr></thead>
    <tbody data-k="rows"></tbody></table></div>
    <p class="small muted">Cocoon roles are set on the hub (COCOON_OWNER_UIDS). They are independent of BioChain console roles.</p>`;
  const acc = await ctx.api("GET", "/api/accounts");
  root.querySelector('[data-k="rows"]').innerHTML = acc.map((a) => `<tr>
    <td><b>${esc(a.display_name || a.uid)}</b><div class="small muted">${esc(a.email || a.uid)}</div></td>
    <td>${esc(a.role)}</td><td>${dateTime(a.last_login)}</td></tr>`).join("") || `<tr><td colspan="3" class="m-empty">No accounts yet.</td></tr>`;
}
