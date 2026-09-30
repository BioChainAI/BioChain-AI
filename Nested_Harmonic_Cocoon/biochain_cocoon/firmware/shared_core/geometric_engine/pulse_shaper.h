// Non-audio modalities (light, haptic, coil) read the same EntrainmentClock
// and turn its phase into an output level. Each puck calls these at its
// control rate (e.g. 2 kHz) and maps the result to PWM.
#pragma once
#include <cmath>
#include "phase.h"

namespace cocoon {

// Smooth 0..1 pulse at the entrainment rate. `duty` narrows the pulse:
// 0.5 gives a raised sine; smaller values give a narrower Hann-windowed burst
// centred on phase 0.5.
inline float smoothPulse(float phaseTurns, float duty) {
    if (duty >= 0.5f) return 0.5f - 0.5f * std::cos(kTwoPi * phaseTurns);
    if (duty <= 0.0f) return 0.0f;
    const float half = duty * 0.5f;
    const float d = std::fabs(wrapTurns(phaseTurns) - 0.5f);
    if (d >= half) return 0.0f;
    return 0.5f + 0.5f * std::cos(kTwoPi * 0.5f * d / half);
}

// Bilateral (EMDR) alternation: returns the level for the LEFT or RIGHT
// actuator. The left side peaks in the first half-cycle and the right side
// in the second, so each side gets one tap per entrainment cycle. Taps are
// windowed so the motor never sees a step change.
inline float bilateralLevel(float phaseTurns, bool rightSide, float tapWidth = 0.35f) {
    const float p = wrapTurns(phaseTurns + (rightSide ? 0.5f : 0.0f));
    return smoothPulse(p, tapWidth);
}

}  // namespace cocoon
