// Hard output limits, applied on the puck regardless of what the orchestrator
// or a preset asks for. The mesh can make a request more conservative, but it
// can never bypass these.
//
// These values are engineering defaults, not medical guidance. See
// docs/architecture/SAFETY.md.
#pragma once
#include <algorithm>
#include <cstdint>
#include "../protocol/shdccp_packet.h"

namespace cocoon {

struct SafetyLimits {
    float maxAudioAmp = 0.80f;            // headroom below DAC full scale
    float minCarrierHz = 40.0f;
    float maxCarrierHz = 1500.0f;
    float minEntrainHz = 0.5f;
    float maxEntrainHz = 45.0f;
    // Photosensitive band: flicker between 3 and 60 Hz is the widely cited
    // risk range for photosensitive epilepsy. Pulsed light in this band stays
    // disabled unless the session carries the explicit consent flag.
    float photoRiskLowHz = 3.0f;
    float photoRiskHighHz = 60.0f;
    float maxPhotonicAmp = 0.60f;         // fraction of LED driver max current
    float maxPhotonicAmpNoConsent = 0.0f; // light fully off in the risk band without consent
    float maxHapticAmp = 0.70f;
    float maxCoilDuty = 0.35f;            // bifilar coil PWM duty ceiling
    float coilThermalCutoffC = 45.0f;     // enclosure-surface temperature
    uint32_t maxSessionMs = 90u * 60u * 1000u;
    uint32_t minRampMs = 250;             // no step changes: floor on every glide
};

// Clamp an incoming UpdateGeo in place for the modality the node drives.
// Returns true if anything was modified, so the node can report it in telemetry.
inline bool applySafety(ShdCcpPacket& p, uint8_t nodeModality, const SafetyLimits& L) {
    ShdCcpPacket before = p;
    p.fe = std::clamp(p.fe, L.minEntrainHz, L.maxEntrainHz);
    p.pan = std::clamp(p.pan, -1.0f, 1.0f);
    p.rampMs = std::max(p.rampMs, L.minRampMs);
    float cap = 1.0f;
    if (nodeModality & kAudio) {
        p.fc = std::clamp(p.fc, L.minCarrierHz, L.maxCarrierHz);
        cap = L.maxAudioAmp;
    } else if (nodeModality & kPhotonic) {
        const bool inRiskBand = p.fe >= L.photoRiskLowHz && p.fe <= L.photoRiskHighHz;
        const bool consent = p.flags & kFlagPhotosensitiveConsent;
        cap = (inRiskBand && !consent) ? L.maxPhotonicAmpNoConsent : L.maxPhotonicAmp;
    } else if (nodeModality & kHaptic) {
        cap = L.maxHapticAmp;
    } else if (nodeModality & kCoil) {
        cap = L.maxCoilDuty;
    }
    p.amp = std::clamp(p.amp, 0.0f, cap);
    return before.fe != p.fe || before.fc != p.fc || before.amp != p.amp ||
           before.pan != p.pan || before.rampMs != p.rampMs;
}

}  // namespace cocoon
