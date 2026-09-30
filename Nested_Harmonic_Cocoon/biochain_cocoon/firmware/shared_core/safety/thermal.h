// NTC thermistor guard (10k @25 °C, B=3950, 10k pull-up to 3V3). Latches off
// above the cutoff and re-arms 5 °C below it (hysteresis).
#pragma once
#ifdef ARDUINO
#include <Arduino.h>
#include <cmath>

namespace cocoon {

class ThermalGuard {
public:
    ThermalGuard(int adcPin, float cutoffC) : pin_(adcPin), cutoff_(cutoffC) {}

    void sample() {
        const float mv = analogReadMilliVolts(pin_);
        if (mv <= 1.0f || mv >= 3299.0f) { tripped_ = true; return; }   // open/short sensor = unsafe
        const float r = 10000.0f * mv / (3300.0f - mv);
        const float invT = 1.0f / 298.15f + std::log(r / 10000.0f) / 3950.0f;
        c_ = 0.9f * c_ + 0.1f * (1.0f / invT - 273.15f);                 // light smoothing
        if (c_ >= cutoff_) tripped_ = true;
        else if (c_ < cutoff_ - 5.0f) tripped_ = false;
    }
    bool tripped() const { return tripped_; }
    float celsius() const { return c_; }

private:
    int pin_;
    float cutoff_;
    float c_ = 25.0f;
    volatile bool tripped_ = false;
};

}  // namespace cocoon
#endif
