# Cocoon Desktop: writing a module

A module is a folder under `orchestrator/frontend/modules/<id>/`:

```
modules/
  my_module/
    module.json   manifest (protocols/schemas/desktop_module.schema.json)
    module.js     ES module: export mount(root, ctx), optional unmount(), onResize(size)
```

Restart the hub. The catalog loads it and it appears in **Add-ons**. A folder
with an invalid manifest or a missing `module.js` is quarantined: it is logged
at startup and never offered.

## Manifest

```json
{"id": "my_module", "name": "My module", "version": "1.0.0", "category": "insight", "icon": "✦",
 "description": "One sentence shown in the add-on drawer.",
 "entry": "module.js", "default_size": "m", "sizes": ["s", "m", "l"],
 "requires_role": "member", "singleton": true, "uses": ["status"]}
```

* `category`: overview · session · insight · mesh · data · system (drawer grouping)
* sizes on the 12-column grid: `s` 3 · `m` 4 · `l` 6 · `xl` 12 columns (collapsing on tablets and phones)
* `requires_role: "owner"` hides the module from members, and the hub refuses such a layout from them

## The `ctx` object

| member | purpose |
|---|---|
| `ctx.user` | `{uid, name, email, picture, role}`, the signed-in account |
| `ctx.isOwner` | true for owner / service / local |
| `ctx.api(method, path, body)` | authenticated call to the hub API; throws `ApiError` with `.status` |
| `ctx.on(feed, fn)` | subscribe to a shared live feed: `"status"` (1 s), `"nodes"` (2 s), `"events"` (1.5 s, delivers new batches) |
| `ctx.latest(feed)` / `ctx.refresh(feed)` | last value / force a poll now |
| `ctx.settings.get()` / `.set(patch)` | per-instance settings, saved in the user's desktop on the hub (≤ 8 KB) |
| `ctx.size()` | current tile size |
| `ctx.toast(msg, kind)` | user feedback (`info`, `warn`, `error`) |

Subscriptions are released automatically when the user removes the module.

## Rules

1. **Only `ctx.api`.** Modules never call `fetch` for the hub or touch the auth
   SDK. The kernel owns the token.
2. **Isolation from BioChain.** No Firestore, and no imports from the BioChain
   repo. `tests/test_isolation.py` fails the build otherwise.
3. **Theme tokens only.** Use `var(--…)` and the `.m-*` helpers from
   `desktop/theme.css`, so the module works in dark and light themes.
4. **Degrade politely.** Handle 403, 404 and 409 (another user's session) with a message, not a broken tile.
5. Shared helpers: `modules/_shared/ui.js` (`esc`, `meter`, `act`, time formatting).
