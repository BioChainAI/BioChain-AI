// NodeRuntime: the behaviour every puck shares, independent of its actuator.
//
//   • boots STANDALONE and runs the default local preset (offline-first);
//   • the first valid orchestrator packet switches it to CONNECTED, and the
//     local preset stops;
//   • if the orchestrator goes silent past the watchdog, it falls back to
//     standalone (resumes the default preset) or fades out, as configured;
//   • preset steps pass through the same safety clamp as mesh packets;
//   • continuous output is capped at SafetyLimits::maxSessionMs. After that the
//     node fades out and stays dark until an explicit Stop (a new session).
//
// The actuator-specific application implements PacketHandler and receives
// only clean, clamped, addressed events. It never needs to know which mode
// produced them.
#pragma once
#include <cstdint>
#include "packet_router.h"
#include "../protocol/preset_player.h"

namespace cocoon {

enum class LinkState : uint8_t { Standalone, Connected };

struct RuntimeConfig {
    uint16_t nodeId = 1;
    NodeType type = NodeType::SonicAmbisonic;
    uint8_t modality = kAudio;
    uint32_t watchdogMs = 8000;
    bool fallbackToPreset = true;     // false = fade out on link loss
    bool autoStartPreset = true;      // run the default preset at power-on
    bool localPhotosensitiveConsent = false;  // set via on-device long-press / NVS
    uint32_t announceIntervalMs = 2000;
};

class NodeRuntime : public PacketHandler {
public:
    NodeRuntime(const RuntimeConfig& cfg, PacketHandler& app, SafetyLimits limits = SafetyLimits{})
        : cfg_(cfg), app_(app), limits_(limits),
          router_(cfg.nodeId, cfg.modality, *this, limits, cfg.watchdogMs) {}

    void begin(uint32_t nowMs) {
        if (cfg_.autoStartPreset) startPreset(defaultPreset(), nowMs);
    }

    DecodeResult feed(const uint8_t* data, size_t len, uint32_t nowMs) {
        now_ = nowMs;
        return router_.handleBytes(data, len, nowMs);
    }

    // Call from the control loop (≥ 50 Hz). Returns true when an Announce is due.
    bool update(uint32_t nowMs) {
        now_ = nowMs;
        if (state_ == LinkState::Connected && router_.watchdogExpired(nowMs)) {
            state_ = LinkState::Standalone;
            ++linkLosses_;
            if (cfg_.fallbackToPreset) startPreset(defaultPreset(), nowMs);
            else app_.onStop(3000);
        }
        if (active_ && nowMs - activeSince_ > limits_.maxSessionMs) {
            active_ = false;
            lockedOut_ = true;
            player_.stop();
            app_.onStop(10000);
        }
        ShdCcpPacket step;
        if (player_.update(nowMs, step)) {
            const Preset* p = player_.current();
            if (p && p->photosensitiveConsentRequired && cfg_.localPhotosensitiveConsent)
                step.flags |= kFlagPhotosensitiveConsent;
            if (step.modality & cfg_.modality) {
                applySafety(step, cfg_.modality, limits_);
                forward(step);
            }
        }
        if (nowMs - lastAnnounce_ >= cfg_.announceIntervalMs) { lastAnnounce_ = nowMs; return true; }
        return false;
    }

    ShdCcpPacket announcePacket(float phaseErrorRad = 0.0f, float temperatureC = 0.0f) const {
        ShdCcpPacket p;
        p.cmd = Command::Announce;
        p.node = cfg_.nodeId;
        p.modality = cfg_.modality;
        p.aux = static_cast<uint16_t>(cfg_.type);
        p.phase = phaseErrorRad;       // last pi6 correction magnitude
        p.amp = temperatureC;          // telemetry piggyback: surface temperature
        p.flags = state_ == LinkState::Standalone ? kFlagStandaloneFallback : 0;
        p.seq = announceSeq_++;
        return p;
    }

    LinkState state() const { return state_; }
    uint32_t linkLosses() const { return linkLosses_; }
    const PresetPlayer& player() const { return player_; }
    const RouterStats& stats() const { return router_.stats(); }
    void setLocalConsent(bool c) { cfg_.localPhotosensitiveConsent = c; }

    // PacketHandler: events from the mesh router.
    void onUpdateGeo(const ShdCcpPacket& p) override { goConnected(); forward(p); }
    void onPi6Sync(float t, uint8_t s, uint32_t slew) override { goConnected(); app_.onPi6Sync(t, s, slew); }
    void onPlayPreset(uint16_t id) override {
        goConnected(false);
        startPreset(findPreset(id), now_);
    }
    void onStop(uint32_t fadeMs) override {
        goConnected();
        active_ = false;
        lockedOut_ = false;      // an explicit Stop ends the session and re-arms output
        app_.onStop(fadeMs);
    }
    bool lockedOut() const { return lockedOut_; }

private:
    void forward(ShdCcpPacket p) {
        if (lockedOut_) p.amp = 0.0f;                    // session ceiling reached
        else if (p.amp > 0.0f && !active_) { active_ = true; activeSince_ = now_; }
        app_.onUpdateGeo(p);
    }
    void goConnected(bool stopPreset = true) {
        state_ = LinkState::Connected;
        if (stopPreset) player_.stop();
    }
    void startPreset(const Preset* p, uint32_t nowMs) { if (p) player_.start(p, nowMs); }

    RuntimeConfig cfg_;
    PacketHandler& app_;
    SafetyLimits limits_;
    PacketRouter router_;
    PresetPlayer player_;
    LinkState state_ = LinkState::Standalone;
    uint32_t now_ = 0;
    uint32_t lastAnnounce_ = 0;
    uint32_t linkLosses_ = 0;
    bool active_ = false;
    bool lockedOut_ = false;
    uint32_t activeSince_ = 0;
    mutable uint16_t announceSeq_ = 1;
};

}  // namespace cocoon
