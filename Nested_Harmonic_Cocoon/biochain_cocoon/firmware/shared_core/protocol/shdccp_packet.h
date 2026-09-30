// shd-ccp: Spatial Harmonic Data - Continuous Control Protocol.
// Binary wire form (v1). The layout is little-endian with a fixed 52 bytes,
// so it fits one ESP-NOW frame (max 250 B) or one UDP datagram.
// The authoritative spec is protocols/docs/shd-ccp_wire_format.md.
// The Python codec (orchestrator/backend/cocoon_backend/shdccp.py) must
// produce the same bytes. Both sides pin the golden vector in
// firmware/tests/test_packet.cpp and orchestrator/backend/tests/.
//
//  off size field       notes
//  0   2    magic       'H','C'
//  2   1    version     1
//  3   1    cmd         Command enum
//  4   2    seq         uint16, wraps; replay window on receiver
//  6   2    node        uint16 target id, 0xFFFF = broadcast
//  8   1    modality    bitmask: 1 audio, 2 photonic, 4 haptic, 8 coil
//  9   1    mode        AudioMode / modality sub-mode
//  10  2    flags       bit0 photosensitive-consent, bit1 standalone-fallback
//  12  4    fc          float32 carrier Hz (coil: PWM base Hz)
//  16  4    fe          float32 entrainment Hz (pi6: macro frequency)
//  20  4    amp         float32 0..1
//  24  4    pan         float32 -1..1
//  28  4    phase       float32 radians (pi6: master phase at transmission; aux = sector crossed)
//  32  4    ramp_ms     uint32 (pi6: slew window ms)
//  36  4    x           float32 metres, user-centred (+x right)
//  40  4    y           float32 metres (+y forward)
//  44  4    z           float32 metres (+z up)
//  48  2    aux         uint16 (pi6: sector 0..11 | preset: id | announce: node type)
//  50  2    crc         CRC-16/CCITT-FALSE over bytes 0..49
#pragma once
#include <cstddef>
#include <cstdint>

namespace cocoon {

constexpr size_t kPacketSize = 52;
constexpr uint16_t kBroadcast = 0xFFFF;
constexpr uint8_t kProtocolVersion = 1;

enum class Command : uint8_t {
    UpdateGeo   = 1,   // glide to new geometric parameters
    Pi6Sync     = 2,   // phase handshake at a π/6 marker
    PlayPreset  = 3,   // run a local standalone preset (aux = preset id)
    Stop        = 4,   // fade out over ramp_ms
    Announce    = 5,   // node → orchestrator: I exist (aux = NodeType)
    Heartbeat   = 6,   // orchestrator → nodes: still here (resets watchdog)
    Telemetry   = 7,   // node → orchestrator: phase error, temperature, etc.
};

enum Modality : uint8_t {
    kAudio    = 1,
    kPhotonic = 2,
    kHaptic   = 4,
    kCoil     = 8,
    kAll      = 15,
};

enum class NodeType : uint16_t {
    SonicAmbisonic = 1,  // Node Type A — biopuck_audio
    Photonic       = 2,  // Node Type B — photonic_light
    HapticEmdr     = 3,  // Node Type C — haptic_emdr
    ScalarCoil     = 4,  // Node Type D — scalar_coil
};

enum PacketFlags : uint16_t {
    kFlagPhotosensitiveConsent = 1u << 0,
    kFlagStandaloneFallback    = 1u << 1,
};

struct ShdCcpPacket {
    Command cmd = Command::UpdateGeo;
    uint16_t seq = 0;
    uint16_t node = kBroadcast;
    uint8_t modality = kAll;
    uint8_t mode = 1;
    uint16_t flags = 0;
    float fc = 432.0f;
    float fe = 10.0f;
    float amp = 0.0f;
    float pan = 0.0f;
    float phase = 0.0f;
    uint32_t rampMs = 0;
    float x = 0.0f, y = 0.0f, z = 0.0f;
    uint16_t aux = 0;
};

enum class DecodeResult : uint8_t { Ok, TooShort, BadMagic, BadVersion, BadCrc, BadValue };

uint16_t crc16Ccitt(const uint8_t* data, size_t len);
void encodePacket(const ShdCcpPacket& p, uint8_t out[kPacketSize]);
DecodeResult decodePacket(const uint8_t* data, size_t len, ShdCcpPacket& out);
const char* decodeResultName(DecodeResult r);

}  // namespace cocoon
