// Biopuck Geometric Audio Engine: sample-accurate binaural, isochronic
// and monaural synthesis from shd-ccp parameters. No audio files involved.
#pragma once
#include <cstddef>
#include <cstdint>
#include "entrainment_clock.h"
#include "ramp.h"

namespace cocoon {

enum class AudioMode : uint8_t {
    Binaural   = 0,  // L = fc - fe/2, R = fc + fe/2 (headphones)
    Isochronic = 1,  // carrier × (0.5 + 0.5 sin 2π fe t) (omni speaker)
    Monaural   = 2,  // (L+R) summed acoustic beat on both channels
};

struct AudioParams {
    float carrierHz = 432.0f;
    float entrainHz = 10.0f;
    float amplitude = 0.0f;     // 0..1 (after safety clamp)
    float pan = 0.0f;           // -1 (L) .. +1 (R), isochronic/monaural only
    AudioMode mode = AudioMode::Isochronic;
};

class GeometricAudioEngine {
public:
    explicit GeometricAudioEngine(float sampleRate = 44100.0f);

    // Glide all parameters to `p` over `rampMs`. A mode change is applied
    // under a short amplitude dip so it never clicks.
    void setParams(const AudioParams& p, uint32_t rampMs);

    // pi6 handshake: align the entrainment phase to the master.
    void syncEntrainment(float masterTurns, uint32_t slewMs);

    // Render interleaved stereo int16 frames (L,R,L,R...) for an I2S DAC.
    void render(int16_t* interleaved, size_t frames);
    // Float variant for tests / host tools. Range [-1, 1].
    void renderFloat(float* interleaved, size_t frames);

    const EntrainmentClock& clock() const { return clock_; }
    float sampleRate() const { return sr_; }
    AudioMode mode() const { return mode_; }

private:
    void frame(float& l, float& r);
    uint32_t msToSamples(uint32_t ms) const {
        return static_cast<uint32_t>(static_cast<float>(ms) * sr_ / 1000.0f);
    }

    float sr_;
    EntrainmentClock clock_;
    Ramp carrier_, amp_, pan_;
    float carrierPhase_ = 0.0f;   // turns
    float halfEnt_ = 0.0f;        // φ_e/2 tracked continuously (φ_e itself wraps at 1)
    float prevEnt_ = 0.0f;
    AudioMode mode_ = AudioMode::Isochronic;
    AudioMode pendingMode_ = AudioMode::Isochronic;
    uint32_t modeSwapCountdown_ = 0;
    float resumeAmp_ = 0.0f;
    uint32_t resumeRamp_ = 0;
};

}  // namespace cocoon
