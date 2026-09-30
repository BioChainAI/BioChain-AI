// Linear parameter glide, advanced once per sample (or once per control tick).
#pragma once
#include <cstdint>

namespace cocoon {

class Ramp {
public:
    explicit Ramp(float initial = 0.0f) : value_(initial), target_(initial) {}

    // Glide to `target` over `samples` steps (0 = jump; used only at boot).
    void setTarget(float target, uint32_t samples) {
        target_ = target;
        if (samples == 0) { value_ = target; remaining_ = 0; step_ = 0; return; }
        remaining_ = samples;
        step_ = (target_ - value_) / static_cast<float>(samples);
    }

    float next() {
        if (remaining_) {
            value_ += step_;
            if (--remaining_ == 0) value_ = target_;   // land exactly, no drift
        }
        return value_;
    }

    float value() const { return value_; }
    float target() const { return target_; }
    bool active() const { return remaining_ != 0; }

private:
    float value_;
    float target_;
    float step_ = 0.0f;
    uint32_t remaining_ = 0;
};

}  // namespace cocoon
