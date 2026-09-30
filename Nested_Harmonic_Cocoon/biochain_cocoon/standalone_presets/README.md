# standalone_presets/

Pre-calculated geometric sequences that pucks run **with no orchestrator**. Each
JSON file is validated against `protocols/schemas/standalone_preset.schema.json`
and compiled into firmware (`firmware/shared_core/protocol/presets_generated.cpp`).

| id | preset | target | modalities | notes |
|---:|---|---|---|---|
| 1 | Deep Sleep Theta Protocol | delta | audio | **default** power-on preset (the spec's reference sequence) |
| 2 | Alpha Calm Focus | alpha | audio (binaural) | loops; headphones |
| 3 | Gamma 40 Hz Audio-Visual | gamma | audio + light | light needs photosensitive consent |
| 4 | Schumann Grounding | theta | audio + coil | 7.83 Hz; loops |
| 5 | Stress Downshift (HRV Recovery) | theta | audio | the spec's 432/10 Hz → 396/4 Hz, 15 s glide |
| 6 | Bilateral Tactile Alternation | alpha | haptic | practitioner-guided |
| 7 | Chakra Ascent (Solfeggio) | alpha | audio | traditional pairings, not validated |

Edit or add a preset, then:

```bash
python3 protocols/validate.py                    # schema check
python3 standalone_presets/compile_presets.py    # regenerate the firmware table (commit it)
```

CI fails if the generated file is stale. Step fields: `hold_s` (after the
ramp), `ramp_s`, `fc`, `fe`, `amp`, `pan`, `mode`, `modality[]`, `note`.
