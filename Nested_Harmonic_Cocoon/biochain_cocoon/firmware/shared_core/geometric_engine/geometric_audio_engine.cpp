#include "geometric_audio_engine.h"
#include <algorithm>
#include <cmath>

namespace cocoon {

namespace {
constexpr uint32_t kModeDipMs = 20;   // fade-out/fade-in window for mode swaps
}

GeometricAudioEngine::GeometricAudioEngine(float sampleRate)
    : sr_(sampleRate), clock_(sampleRate, 10.0f), carrier_(432.0f), amp_(0.0f), pan_(0.0f) {}

void GeometricAudioEngine::setParams(const AudioParams& p, uint32_t rampMs) {
    const uint32_t n = msToSamples(rampMs);
    carrier_.setTarget(p.carrierHz, n);
    clock_.setFrequency(p.entrainHz, n);
    pan_.setTarget(std::clamp(p.pan, -1.0f, 1.0f), n);

    if (p.mode != mode_) {
        // Fade out, swap the mode at silence, then fade back up to target.
        pendingMode_ = p.mode;
        modeSwapCountdown_ = msToSamples(kModeDipMs);
        amp_.setTarget(0.0f, modeSwapCountdown_);
        resumeAmp_ = std::clamp(p.amplitude, 0.0f, 1.0f);
        resumeRamp_ = std::max(n, msToSamples(kModeDipMs));
    } else {
        amp_.setTarget(std::clamp(p.amplitude, 0.0f, 1.0f), n);
    }
}

void GeometricAudioEngine::syncEntrainment(float masterTurns, uint32_t slewMs) {
    clock_.syncTo(masterTurns, std::max<uint32_t>(1, msToSamples(slewMs)));
}

void GeometricAudioEngine::frame(float& l, float& r) {
    if (modeSwapCountdown_ && --modeSwapCountdown_ == 0) {
        mode_ = pendingMode_;
        amp_.setTarget(resumeAmp_, resumeRamp_);
    }

    const float fc = carrier_.next();
    const float a = amp_.next();
    const float pan = pan_.next();
    const float ent = clock_.tick();                       // turns
    carrierPhase_ = wrapTurns(carrierPhase_ + fc / sr_);
    // φ_e/2 cannot be taken from the wrapped phase directly: it would jump by
    // half a turn at every wrap. Accumulate the signed per-sample delta
    // instead; the delta already includes any pi6 slew.
    halfEnt_ = wrapTurns(halfEnt_ + 0.5f * phaseError(ent, prevEnt_));
    prevEnt_ = ent;

    // Equal-power pan law.
    const float theta = (pan + 1.0f) * 0.25f * kTwoPi * 0.5f;  // 0..π/2
    const float gl = std::cos(theta), gr = std::sin(theta);

    switch (mode_) {
    case AudioMode::Binaural: {
        // φ_L = φ_c − φ_e/2, φ_R = φ_c + φ_e/2. The beat phase (R−L) *is*
        // the entrainment phase, so a pi6 slew moves the perceived beat as well.
        l = a * std::sin(kTwoPi * (carrierPhase_ - halfEnt_));
        r = a * std::sin(kTwoPi * (carrierPhase_ + halfEnt_));
        break;
    }
    case AudioMode::Monaural: {
        const float s = 0.5f * a * (std::sin(kTwoPi * (carrierPhase_ - halfEnt_)) +
                                    std::sin(kTwoPi * (carrierPhase_ + halfEnt_)));
        l = s * gl * 1.41421356f;
        r = s * gr * 1.41421356f;
        break;
    }
    case AudioMode::Isochronic:
    default: {
        // Raised-sine envelope: smooth pulse, no hard gating clicks.
        const float env = 0.5f - 0.5f * std::cos(kTwoPi * ent);
        const float s = a * std::sin(kTwoPi * carrierPhase_) * env;
        l = s * gl * 1.41421356f;
        r = s * gr * 1.41421356f;
        break;
    }
    }
    l = std::clamp(l, -1.0f, 1.0f);
    r = std::clamp(r, -1.0f, 1.0f);
}

void GeometricAudioEngine::renderFloat(float* out, size_t frames) {
    for (size_t i = 0; i < frames; ++i) frame(out[2 * i], out[2 * i + 1]);
}

void GeometricAudioEngine::render(int16_t* out, size_t frames) {
    for (size_t i = 0; i < frames; ++i) {
        float l, r;
        frame(l, r);
        out[2 * i] = static_cast<int16_t>(l * 32767.0f);
        out[2 * i + 1] = static_cast<int16_t>(r * 32767.0f);
    }
}

}  // namespace cocoon
