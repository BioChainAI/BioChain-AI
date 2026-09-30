// The macro-entrainment phase shared by every modality on a puck.
//
// It is a phase accumulator at the entrainment frequency f_e. It can be
// pulled toward a master phase through a smoothed slew, never by a jump.
// This is the `pi6` handshake target.
#pragma once
#include <cstdint>
#include "phase.h"
#include "ramp.h"

namespace cocoon {

class EntrainmentClock {
public:
    explicit EntrainmentClock(float tickRateHz, float fe = 10.0f)
        : rate_(tickRateHz), fe_(fe) {}

    void setFrequency(float fe, uint32_t rampTicks) { fe_.setTarget(fe, rampTicks); }
    float frequency() const { return fe_.value(); }

    // Begin a phase slew toward `masterTurns`. The error is spread evenly over
    // `slewTicks`. A new handshake replaces any slew still in progress.
    // It uses the error measured now, so corrections never stack.
    void syncTo(float masterTurns, uint32_t slewTicks) {
        float err = phaseError(masterTurns, phase_);
        if (slewTicks == 0) slewTicks = 1;
        slewPerTick_ = err / static_cast<float>(slewTicks);
        slewRemaining_ = slewTicks;
        lastError_ = err;
    }

    // Advance one tick; returns the new phase in turns.
    float tick() {
        float inc = fe_.next() / rate_;
        if (slewRemaining_) { inc += slewPerTick_; --slewRemaining_; }
        phase_ = wrapTurns(phase_ + inc);
        return phase_;
    }

    float phase() const { return phase_; }
    float lastError() const { return lastError_; }
    bool slewing() const { return slewRemaining_ != 0; }
    float tickRate() const { return rate_; }

private:
    float rate_;
    Ramp fe_;
    float phase_ = 0.0f;
    float slewPerTick_ = 0.0f;
    uint32_t slewRemaining_ = 0;
    float lastError_ = 0.0f;
};

}  // namespace cocoon
