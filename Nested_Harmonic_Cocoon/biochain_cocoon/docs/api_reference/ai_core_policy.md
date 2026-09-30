# AI core: policy interface

```python
from cocoon_ai import GuidePolicy, GeoCommand, BioState

class MyPolicy(GuidePolicy):
    name = "my_policy/1"
    def reset(self, target_band, *, audio_mode="isochronic", photosensitive_consent=False,
              modalities=("audio", "photonic", "haptic", "coil")): ...
    def step(self, state: BioState, now: float, zone_resistance: dict | None = None) -> list[GeoCommand]:
        """Return [] to hold. Rate-limit yourself; the engine calls every tick."""
```

* `BioState`: `calm`, `arousal`, `depth`, `bands{}`, `dominant`, `rmssd_ms`,
  `hr_bpm`, `gsr_us`, `zone_gsr{}`, and `sources` (which channels actually contributed).
* `GeoCommand.to_update_geo()` produces schema-valid shd-ccp JSON. Always fill in `rationale`.
* Geometry helpers: `state_quaternion(state)`, `target_quaternion(band)`,
  `lorentz_lift(q)`, `hyperbolic_distance(qa, qb)`. These are the same lift and
  quadrance as BioChain's `engram_shard.py`. A policy trained in the BioChain
  hyperbolic-AI stack can use `hyperbolic_distance` directly as its objective.
* Safety is not the policy's job and cannot be overridden by it. The engine
  validates each command against the schema, the orchestrator checks consent,
  and the pucks clamp.

The built-in `RuleGuide` (pace → lead → escalate → arrive) is documented in
`orchestrator/ai_core/cocoon_ai/guide.py`. Its behaviour is pinned by
`orchestrator/ai_core/tests/test_ai_core.py`.
