// Standalone (offline) sequencer. It steps through a compiled preset,
// a list of geometric targets with hold times, and emits UpdateGeo-shaped
// packets into the same handler the mesh uses. Standalone and connected
// modes therefore share one code path.
#pragma once
#include <cstddef>
#include <cstdint>
#include "shdccp_packet.h"

namespace cocoon {

struct PresetStep {
    uint32_t holdMs;     // time at this step, measured after the ramp completes
    uint32_t rampMs;     // glide into this step
    float fc, fe, amp, pan;
    uint8_t mode;        // AudioMode for audio nodes; sub-mode otherwise
    uint8_t modality;    // which modalities this step drives
};

struct Preset {
    uint16_t id;
    const char* name;
    const PresetStep* steps;
    size_t count;
    bool loop;
    bool photosensitiveConsentRequired;  // if set, photonic nodes stay dark without consent
};

class PresetPlayer {
public:
    void start(const Preset* p, uint32_t nowMs) {
        preset_ = p; index_ = 0; stepStart_ = nowMs; emitPending_ = true; done_ = false;
    }
    void stop() { preset_ = nullptr; }
    bool running() const { return preset_ && !done_; }
    const Preset* current() const { return preset_; }
    size_t stepIndex() const { return index_; }

    // Returns true and fills `out` when a new step should be applied.
    bool update(uint32_t nowMs, ShdCcpPacket& out) {
        if (!preset_ || done_ || preset_->count == 0) return false;
        const PresetStep& s = preset_->steps[index_];
        if (!emitPending_ && nowMs - stepStart_ >= s.rampMs + s.holdMs) {
            if (++index_ >= preset_->count) {
                if (!preset_->loop) { done_ = true; return false; }
                index_ = 0;
            }
            stepStart_ = nowMs;
            emitPending_ = true;
        }
        if (!emitPending_) return false;
        emitPending_ = false;
        const PresetStep& n = preset_->steps[index_];
        out = ShdCcpPacket{};
        out.cmd = Command::UpdateGeo;
        out.fc = n.fc; out.fe = n.fe; out.amp = n.amp; out.pan = n.pan;
        out.mode = n.mode; out.modality = n.modality; out.rampMs = n.rampMs;
        out.aux = preset_->id;
        return true;
    }

private:
    const Preset* preset_ = nullptr;
    size_t index_ = 0;
    uint32_t stepStart_ = 0;
    bool emitPending_ = false;
    bool done_ = false;
};

// Defined in presets_generated.cpp (built from standalone_presets/*.json).
const Preset* findPreset(uint16_t id);
const Preset* defaultPreset();
size_t presetCount();
const Preset* presetAt(size_t i);

}  // namespace cocoon
