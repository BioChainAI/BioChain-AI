# frontend/: Cocoon Desktop

The user's personal control panel for the Nested Harmonic Cocoon, served by the hub at `/`.
Plain ES modules with no build step.

```
index.html            shell: sign-in gate + desktop + add-on drawer
desktop/auth.js       sign-in with the BioChain account (Firebase app + auth only)
desktop/kernel.js     the only code that talks to the hub: API client, shared live feeds, module ctx
desktop/desktop.js    grid, add/remove, arrange (drag + size), templates, theme, autosave
desktop/theme.css     design tokens (dark/light) + .m-* helpers for modules
modules/<id>/         add-ons: module.json + module.js (11 shipped)
modules/_shared/ui.js helpers shared by modules
tests/run_e2e.py      two-user browser test against a real hub (needs `npm i playwright`)
```

| module | category | role |
|---|---|---|
| Cocoon overview | overview | member |
| Guided session · Preset library · Manual override | session | member |
| Biostate · Guide rationale | insight | member |
| Spatial mapper (drag = owner) · Mesh health | mesh | member |
| Profiles & consent · Session history | data | member |
| Hub accounts | system | **owner** |

Templates: *Personal cocoon* (the first-run default), *Practitioner*, *Mesh engineer*.
Writing a module: `docs/api_reference/desktop_modules.md`. Identity rules:
`docs/architecture/identity_and_isolation.md`.
