// Phase utilities. Phase is stored in TURNS (0.0 .. 1.0) rather than radians:
// wrapping is a single subtraction and float precision is spent where it matters.
#pragma once
#include <cmath>
#include <cstdint>

namespace cocoon {

constexpr float kTwoPi = 6.28318530717958647692f;
constexpr float kPi6Turns = 1.0f / 12.0f;   // π/6 expressed in turns

inline float wrapTurns(float t) {
    t -= std::floor(t);
    return t;                                   // [0, 1)
}

// Shortest signed distance from a to b, in turns, in (-0.5, 0.5].
inline float phaseError(float target, float local) {
    float d = wrapTurns(target) - wrapTurns(local);
    if (d > 0.5f) d -= 1.0f;
    if (d <= -0.5f) d += 1.0f;
    return d;
}

inline float radiansToTurns(float rad) { return wrapTurns(rad / kTwoPi); }
inline float turnsToRadians(float t) { return t * kTwoPi; }

// Sector index (0..11) of a phase on the π/6 grid.
inline uint8_t pi6Sector(float turns) {
    int s = static_cast<int>(wrapTurns(turns) * 12.0f);
    return static_cast<uint8_t>(s > 11 ? 11 : s);
}

}  // namespace cocoon
