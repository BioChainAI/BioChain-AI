#include "packet_router.h"
#include "../geometric_engine/phase.h"

namespace cocoon {

bool PacketRouter::fresh(uint16_t seq) {
    // Serial-number arithmetic (RFC 1982 style) on 16 bits. seq==0 is the
    // orchestrator's restart marker and always resets the window.
    if (!haveSeq_ || seq == 0 || static_cast<int16_t>(seq - lastSeq_) > 0) {
        haveSeq_ = true;
        lastSeq_ = seq;
        return true;
    }
    return false;
}

DecodeResult PacketRouter::handleBytes(const uint8_t* data, size_t len, uint32_t nowMs) {
    ShdCcpPacket p;
    DecodeResult r = decodePacket(data, len, p);
    if (r != DecodeResult::Ok) {
        (r == DecodeResult::BadCrc ? stats_.rejectedCrc : stats_.rejectedOther)++;
        return r;
    }
    if (p.node != kBroadcast && p.node != id_) { stats_.notForMe++; return r; }
    // UpdateGeo and Pi6Sync are per-modality: the haptic bilateral clock runs at
    // its own pacing rate, so the audio/light macro phase must not pull on it.
    const bool perModality = p.cmd == Command::UpdateGeo || p.cmd == Command::Pi6Sync;
    if (perModality && !(p.modality & modality_)) { stats_.notForMe++; return r; }
    if (!fresh(p.seq)) { stats_.stale++; return r; }

    everHeard_ = true;
    lastHeardMs_ = nowMs;
    stats_.accepted++;

    switch (p.cmd) {
    case Command::UpdateGeo:
        if (applySafety(p, modality_, limits_)) stats_.clamped++;
        h_.onUpdateGeo(p);
        break;
    case Command::Pi6Sync:
        stats_.pi6Count++;
        h_.onPi6Sync(radiansToTurns(p.phase), static_cast<uint8_t>(p.aux % 12),
                     p.rampMs ? p.rampMs : 50);
        break;
    case Command::PlayPreset:
        h_.onPlayPreset(p.aux);
        break;
    case Command::Stop:
        h_.onStop(p.rampMs < limits_.minRampMs ? limits_.minRampMs : p.rampMs);
        break;
    case Command::Heartbeat:
    case Command::Announce:
    case Command::Telemetry:
        break;  // watchdog already refreshed; node→orchestrator types ignored here
    }
    return r;
}

}  // namespace cocoon
