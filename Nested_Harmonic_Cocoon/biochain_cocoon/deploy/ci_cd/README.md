# ci_cd/

* `cocoon-ci.yml` is the canonical GitHub Actions pipeline. The live copy is
  `.github/workflows/cocoon-ci.yml` at the repo root, because GitHub only runs
  workflows from there. It is path-filtered to `Nested_Harmonic_Cocoon/**`, so
  it never runs for BioChain-only changes.
* `check_workflow_sync.sh` confirms the two copies are identical.
* `run_local_ci.sh` runs the same checks on your machine.

Jobs: firmware host tests (g++) · schema + generated-code checks · Python
3.10/3.12 orchestrator + AI tests · ESP32-S3 PlatformIO build matrix, with
firmware artifacts uploaded · Docker image build + simulator smoke test.
