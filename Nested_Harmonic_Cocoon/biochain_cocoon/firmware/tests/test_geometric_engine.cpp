#include <cmath>
#include <vector>
#include "test_harness.h"
#include "../shared_core/geometric_engine/entrainment_clock.h"
#include "../shared_core/geometric_engine/geometric_audio_engine.h"
#include "../shared_core/geometric_engine/pulse_shaper.h"

using namespace cocoon;

namespace {
constexpr float SR = 44100.0f;

// Count upward zero crossings; returns an estimated frequency.
double estimateHz(const std::vector<float>& x, float sr) {
    int n = 0; long first = -1, last = -1;
    for (size_t i = 1; i < x.size(); ++i)
        if (x[i - 1] < 0 && x[i] >= 0) { if (first < 0) first = (long)i; last = (long)i; ++n; }
    return n > 1 ? (n - 1) * sr / double(last - first) : 0.0;
}

std::vector<float> channel(const std::vector<float>& st, int ch) {
    std::vector<float> out(st.size() / 2);
    for (size_t i = 0; i < out.size(); ++i) out[i] = st[2 * i + ch];
    return out;
}
}  // namespace

TEST(phase_error_takes_shortest_path) {
    CHECK_NEAR(phaseError(0.05f, 0.95f), 0.10f, 1e-6);
    CHECK_NEAR(phaseError(0.95f, 0.05f), -0.10f, 1e-6);
    CHECK_NEAR(phaseError(0.5f, 0.0f), 0.5f, 1e-6);
    CHECK(pi6Sector(0.0f) == 0);
    CHECK(pi6Sector(1.0f / 12.0f + 1e-4f) == 1);
    CHECK(pi6Sector(0.9999f) == 11);
}

TEST(ramp_lands_exactly_on_target) {
    Ramp r(432.0f);
    r.setTarget(396.0f, 1000);
    for (int i = 0; i < 999; ++i) r.next();
    CHECK(r.active());
    CHECK(r.next() == 396.0f);
    CHECK(!r.active());
}

TEST(entrainment_clock_runs_at_fe) {
    EntrainmentClock c(1000.0f, 4.0f);
    int wraps = 0; float prev = 0;
    for (int i = 0; i < 10000; ++i) { float p = c.tick(); if (p < prev) ++wraps; prev = p; }
    CHECK(wraps == 40);   // 4 Hz × 10 s
}

TEST(pi6_slew_converges_without_jumps) {
    EntrainmentClock master(SR, 7.83f), puck(SR, 7.83f);
    for (int i = 0; i < 1234; ++i) master.tick();       // puck is now out of phase
    const float nominal = 7.83f / SR;
    puck.syncTo(master.phase(), static_cast<uint32_t>(0.05f * SR));  // 50 ms slew
    float maxStep = 0, prev = puck.phase();
    for (int i = 0; i < static_cast<int>(0.05f * SR) + 10; ++i) {
        master.tick();
        float p = puck.tick();
        float step = std::fabs(phaseError(p, prev));
        if (step > maxStep) maxStep = step;
        prev = p;
    }
    CHECK_NEAR(phaseError(master.phase(), puck.phase()), 0.0f, 1e-4);
    // Largest per-sample step is bounded: nominal + |err|/N, where |err| ≤ 0.5 turn
    CHECK(maxStep < nominal + 0.5f / (0.05f * SR) + 1e-6f);
    CHECK(maxStep < 1e-3f);                              // no instantaneous reset
}

TEST(binaural_channels_are_fc_minus_plus_half_fe) {
    GeometricAudioEngine e(SR);
    e.setParams({432.0f, 10.0f, 0.8f, 0.0f, AudioMode::Binaural}, 0);
    std::vector<float> buf(2 * 44100);
    e.renderFloat(buf.data(), 44100);   // warm-up (includes mode dip)
    e.renderFloat(buf.data(), 44100);
    CHECK_NEAR(estimateHz(channel(buf, 0), SR), 427.0, 0.2);
    CHECK_NEAR(estimateHz(channel(buf, 1), SR), 437.0, 0.2);
    // No half-turn jump when the entrainment phase wraps (regression: φ_e/2 wrap).
    float maxDelta = 0;
    for (size_t i = 1; i < 44100; ++i)
        maxDelta = std::fmax(maxDelta, std::fabs(buf[2 * i] - buf[2 * i - 2]));
    CHECK(maxDelta < 0.055f);
}

TEST(isochronic_is_click_free_and_pulses_at_fe) {
    GeometricAudioEngine e(SR);
    e.setParams({432.0f, 4.0f, 0.8f, 0.0f, AudioMode::Isochronic}, 0);
    std::vector<float> buf(2 * 44100);
    e.renderFloat(buf.data(), 44100);
    auto l = channel(buf, 0);
    // A pure 432 Hz sine at amp 0.8 changes at most 2π·432/44100·0.8 ≈ 0.049 per sample.
    float maxDelta = 0;
    for (size_t i = 1; i < l.size(); ++i) maxDelta = std::fmax(maxDelta, std::fabs(l[i] - l[i - 1]));
    CHECK(maxDelta < 0.055f);
    // Envelope: RMS in 25 ms windows should rise and fall 4 times per second.
    int peaks = 0; double prevRms = 0; bool rising = false;
    for (size_t w = 0; w + 1102 < l.size(); w += 1102) {
        double s = 0; for (size_t i = w; i < w + 1102; ++i) s += l[i] * l[i];
        double rms = std::sqrt(s / 1102);
        if (rms < prevRms && rising) ++peaks;
        rising = rms > prevRms; prevRms = rms;
    }
    CHECK(peaks >= 3 && peaks <= 5);
}

TEST(parameter_glide_has_no_discontinuity) {
    GeometricAudioEngine e(SR);
    e.setParams({432.0f, 10.0f, 0.8f, 0.0f, AudioMode::Isochronic}, 0);
    std::vector<float> buf(2 * 4410);
    e.renderFloat(buf.data(), 4410);
    e.setParams({396.0f, 4.0f, 0.5f, 0.3f, AudioMode::Isochronic}, 1500);  // spec: stress downshift glide
    float prev = buf[2 * 4409], maxDelta = 0;
    for (int blk = 0; blk < 20; ++blk) {
        e.renderFloat(buf.data(), 4410);
        for (int i = 0; i < 4410; ++i) { maxDelta = std::fmax(maxDelta, std::fabs(buf[2 * i] - prev)); prev = buf[2 * i]; }
    }
    CHECK(maxDelta < 0.07f);
}

TEST(mode_change_dips_to_silence) {
    GeometricAudioEngine e(SR);
    e.setParams({432.0f, 10.0f, 0.8f, 0.0f, AudioMode::Isochronic}, 0);
    std::vector<float> buf(2 * 4410);
    e.renderFloat(buf.data(), 4410);
    e.setParams({432.0f, 10.0f, 0.8f, 0.0f, AudioMode::Binaural}, 0);
    e.renderFloat(buf.data(), 882);                      // exactly the 20 ms dip
    CHECK(std::fabs(buf[2 * 881]) < 0.01f);
    CHECK(e.mode() == AudioMode::Binaural);
}

TEST(pulse_shapes_are_bounded_and_alternate) {
    for (int i = 0; i <= 100; ++i) {
        float p = i / 100.0f;
        float a = smoothPulse(p, 0.5f), b = smoothPulse(p, 0.2f);
        CHECK(a >= 0.0f && a <= 1.0f);
        CHECK(b >= 0.0f && b <= 1.0f);
    }
    CHECK_NEAR(smoothPulse(0.5f, 0.2f), 1.0f, 1e-6);
    CHECK_NEAR(smoothPulse(0.0f, 0.2f), 0.0f, 1e-6);
    // Bilateral: left peaks at phase 0.5, right at phase 0.0; never both high.
    CHECK_NEAR(bilateralLevel(0.5f, false), 1.0f, 1e-6);
    CHECK_NEAR(bilateralLevel(0.0f, true), 1.0f, 1e-6);
    for (int i = 0; i < 100; ++i) {
        float p = i / 100.0f;
        CHECK(bilateralLevel(p, false) * bilateralLevel(p, true) < 0.05f);
    }
}
