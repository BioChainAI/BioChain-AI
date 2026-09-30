// Transport-agnostic packet intake. A transport (ESP-NOW, UDP, serial,
// or a test) hands in raw bytes. The router validates them, filters by
// address and freshness, applies safety limits, and dispatches to the node.
#pragma once
#include <cstddef>
#include <cstdint>
#include "../protocol/shdccp_packet.h"
#include "../safety/safety_limits.h"

namespace cocoon {

class PacketHandler {
public:
    virtual ~PacketHandler() = default;
    virtual void onUpdateGeo(const ShdCcpPacket& p) = 0;
    virtual void onPi6Sync(float masterTurns, uint8_t sector, uint32_t slewMs) = 0;
    virtual void onPlayPreset(uint16_t presetId) = 0;
    virtual void onStop(uint32_t fadeMs) = 0;
};

struct RouterStats {
    uint32_t accepted = 0;
    uint32_t rejectedCrc = 0;
    uint32_t rejectedOther = 0;
    uint32_t notForMe = 0;
    uint32_t stale = 0;
    uint32_t clamped = 0;
    uint32_t pi6Count = 0;
};

class PacketRouter {
public:
    PacketRouter(uint16_t nodeId, uint8_t modality, PacketHandler& handler,
                 SafetyLimits limits = SafetyLimits{}, uint32_t watchdogMs = 8000)
        : id_(nodeId), modality_(modality), h_(handler), limits_(limits), watchdogMs_(watchdogMs) {}

    DecodeResult handleBytes(const uint8_t* data, size_t len, uint32_t nowMs);

    // True when the orchestrator has been silent long enough that the node
    // should fall back to its standalone sequence.
    bool watchdogExpired(uint32_t nowMs) const {
        return !everHeard_ || (nowMs - lastHeardMs_) > watchdogMs_;
    }
    bool everHeard() const { return everHeard_; }
    const RouterStats& stats() const { return stats_; }

private:
    bool fresh(uint16_t seq);

    uint16_t id_;
    uint8_t modality_;
    PacketHandler& h_;
    SafetyLimits limits_;
    uint32_t watchdogMs_;
    uint32_t lastHeardMs_ = 0;
    bool everHeard_ = false;
    bool haveSeq_ = false;
    uint16_t lastSeq_ = 0;
    RouterStats stats_;
};

}  // namespace cocoon
