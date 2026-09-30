# Safety, consent and claims

The Harmonic Cocoon is a **wellness and research instrument, not a medical
device**. It does not diagnose, treat or cure any condition.

## Enforced in firmware (`firmware/shared_core/safety/safety_limits.h`)

| hazard | limit |
|---|---|
| hearing | audio amplitude ≤ 0.80 FS; carrier 40–1500 Hz; every change glides ≥ 250 ms; amp muted until the first clean buffer |
| **photosensitive seizures** | pulsed light between **3 and 60 Hz is forced dark** unless consent is present (packet flag, or on-device consent set by a 3 s button hold, stored in NVS); intensity ≤ 60 % of driver max |
| LED / coil heat | NTC cutoff: LEDs 60 °C, coil 45 °C (latched, with 5 °C hysteresis); open/short sensor = off |
| coil drive | duty ≤ 0.35, bipolar with no DC, driver current limit ≈ 2 A |
| haptics | amplitude ≤ 0.70; never auto-start at power-on |
| entrainment range | 0.5–45 Hz |
| session length | 90 min of continuous output, then fade out and stay dark until an explicit Stop (or a power cycle); the orchestrator also ends sessions at 90 min |

## Enforced in the orchestrator

* A photonic session with consent requires the profile to have **recorded**
  consent (with timestamp) first. Otherwise the request fails with 403.
* The Guide never turns light on without consent. The rationale log says when light was skipped.
* A practitioner override pauses the AI for 30 s. "Fade all out" is always one click away.

## Who should not use it without clinical advice

Anyone with epilepsy or photosensitivity, an implanted electronic device
(pacemaker, cochlear implant, neurostimulator; the coil node especially),
pregnancy, a psychiatric condition being treated with EMDR, or a history of
dissociation. Bilateral stimulation for trauma processing belongs with a
qualified therapist.

## Status of claims

| concept | status |
|---|---|
| auditory beat stimulation (binaural / isochronic) | studied; effects on EEG and mood are modest and inconsistent across studies |
| 40 Hz audio-visual stimulation | active research area; not an established treatment |
| 650 nm photobiomodulation | studied for skin and tissue; effects of low-power ambient exposure are unclear |
| bilateral tactile stimulation (EMDR component) | a component of an established therapy *when delivered by a therapist* |
| solfeggio carrier frequencies, chakra zones | traditional and contemplative; **no validated physiological basis** |
| "scalar waves", crystal-modulated coils | **no established physical mechanism**; Node D is instrumented so claims can be tested, not assumed |

Data: biofeedback is health data. It stays on the hub, can be deleted
automatically after N days, and leaves the device only as digests (BioChain
bridge), and only by the user's action.
