# bifilar_resonance_test

See `../README.md` for the question this testbed answers. Build and monitor:

```bash
pio run -d firmware/testbeds/bifilar_resonance_test -t upload -t monitor
```

Log results under `results/<date>_<hardware>.csv` in this folder. Record
the hardware revision and any wiring change in the file header. Promote proven
settings into `shared_core` or the matching node, together with a test.
