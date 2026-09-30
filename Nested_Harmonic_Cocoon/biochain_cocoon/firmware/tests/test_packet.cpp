#include <cstring>
#include "test_harness.h"
#include "../shared_core/protocol/shdccp_packet.h"
#include "../shared_core/network_stack/packet_router.h"
#include "../shared_core/protocol/preset_player.h"

using namespace cocoon;

// Golden vector. The Python codec (orchestrator/backend/tests/test_shdccp.py)
// pins the same bytes, so the two implementations cannot drift apart silently.
static const char* kGoldenHex =
    "4843010107002a0001010000"   // magic, v1, UpdateGeo, seq 7, node 42, audio, isochronic, flags 0
    "0000c643"                   // fc 396.0
    "00008040"                   // fe 4.0
    "cdcc4c3f"                   // amp 0.8
    "00000000"                   // pan 0.0
    "00000000"                   // phase 0.0
    "983a0000"                   // ramp 15000 ms
    "0000803f"                   // x 1.0
    "000000bf"                   // y -0.5
    "00000000"                   // z 0.0
    "0000";                      // aux 0   (crc follows)

static ShdCcpPacket goldenPacket() {
    ShdCcpPacket p;
    p.cmd = Command::UpdateGeo; p.seq = 7; p.node = 42; p.modality = kAudio; p.mode = 1;
    p.fc = 396.0f; p.fe = 4.0f; p.amp = 0.8f; p.pan = 0.0f; p.phase = 0.0f; p.rampMs = 15000;
    p.x = 1.0f; p.y = -0.5f; p.z = 0.0f; p.aux = 0;
    return p;
}

static std::string hex(const uint8_t* b, size_t n) {
    static const char* d = "0123456789abcdef";
    std::string s;
    for (size_t i = 0; i < n; ++i) { s += d[b[i] >> 4]; s += d[b[i] & 15]; }
    return s;
}

TEST(crc16_ccitt_false_check_value) {
    const uint8_t msg[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
    CHECK(crc16Ccitt(msg, 9) == 0x29B1);   // standard check value
}

TEST(golden_vector_matches) {
    uint8_t buf[kPacketSize];
    encodePacket(goldenPacket(), buf);
    CHECK(hex(buf, 50) == kGoldenHex);
    std::printf("    golden crc = %02x%02x\n", buf[50], buf[51]);
    CHECK(hex(buf + 50, 2) == "be02");
}

TEST(roundtrip_and_corruption_rejected) {
    uint8_t buf[kPacketSize];
    encodePacket(goldenPacket(), buf);
    ShdCcpPacket d;
    CHECK(decodePacket(buf, kPacketSize, d) == DecodeResult::Ok);
    CHECK(d.fc == 396.0f && d.rampMs == 15000 && d.node == 42 && d.y == -0.5f);
    int caught = 0;
    for (size_t bit = 0; bit < kPacketSize * 8; ++bit) {
        uint8_t c[kPacketSize]; std::memcpy(c, buf, kPacketSize);
        c[bit / 8] ^= 1u << (bit % 8);
        if (decodePacket(c, kPacketSize, d) != DecodeResult::Ok) ++caught;
    }
    CHECK(caught == static_cast<int>(kPacketSize * 8));   // every single-bit flip
    CHECK(decodePacket(buf, 10, d) == DecodeResult::TooShort);
}

namespace {
struct Recorder : PacketHandler {
    int geo = 0, pi6 = 0, preset = 0, stop = 0;
    ShdCcpPacket last; float turns = 0; uint8_t sector = 0; uint16_t presetId = 0;
    void onUpdateGeo(const ShdCcpPacket& p) override { ++geo; last = p; }
    void onPi6Sync(float t, uint8_t s, uint32_t) override { ++pi6; turns = t; sector = s; }
    void onPlayPreset(uint16_t id) override { ++preset; presetId = id; }
    void onStop(uint32_t) override { ++stop; }
};
void send(PacketRouter& r, ShdCcpPacket p, uint32_t now) {
    uint8_t b[kPacketSize]; encodePacket(p, b); r.handleBytes(b, kPacketSize, now);
}
}  // namespace

TEST(router_addressing_replay_and_safety) {
    Recorder rec;
    PacketRouter r(42, kAudio, rec);
    CHECK(r.watchdogExpired(0));
    ShdCcpPacket p = goldenPacket();
    p.amp = 1.0f; p.rampMs = 0;                 // above the audio cap, zero ramp
    send(r, p, 100);
    CHECK(rec.geo == 1);
    CHECK_NEAR(rec.last.amp, 0.8f, 1e-6);       // clamped to maxAudioAmp
    CHECK(rec.last.rampMs == 250);              // minimum glide enforced
    send(r, p, 110);                            // same seq → replay
    CHECK(rec.geo == 1 && r.stats().stale == 1);
    p.seq = 8; p.node = 7;                      // not for me
    send(r, p, 120);
    CHECK(rec.geo == 1 && r.stats().notForMe == 1);
    p.seq = 9; p.node = kBroadcast; p.modality = kPhotonic;   // wrong modality
    send(r, p, 130);
    CHECK(rec.geo == 1);

    ShdCcpPacket s; s.cmd = Command::Pi6Sync; s.seq = 10; s.aux = 3;
    s.phase = 3 * 3.14159265f / 6; s.rampMs = 50;
    send(r, s, 140);
    CHECK(rec.pi6 == 1 && rec.sector == 3);
    CHECK_NEAR(rec.turns, 0.25f, 1e-5);
    s.seq = 11; s.modality = kHaptic;           // haptic clock group: not for an audio node
    send(r, s, 145);
    CHECK(rec.pi6 == 1);

    CHECK(!r.watchdogExpired(140 + 7999));
    CHECK(r.watchdogExpired(140 + 8001));
    ShdCcpPacket restart = goldenPacket(); restart.seq = 0;   // orchestrator restart marker
    send(r, restart, 9000);
    CHECK(rec.geo == 2);
}

TEST(photonic_blocked_in_risk_band_without_consent) {
    SafetyLimits L;
    ShdCcpPacket p; p.fe = 40.0f; p.amp = 0.5f;
    applySafety(p, kPhotonic, L);
    CHECK(p.amp == 0.0f);
    ShdCcpPacket q; q.fe = 40.0f; q.amp = 0.9f; q.flags = kFlagPhotosensitiveConsent;
    applySafety(q, kPhotonic, L);
    CHECK_NEAR(q.amp, 0.6f, 1e-6);
    ShdCcpPacket c; c.amp = 0.9f;
    applySafety(c, kCoil, L);
    CHECK_NEAR(c.amp, 0.35f, 1e-6);
}

TEST(preset_table_and_player) {
    CHECK(presetCount() >= 7);
    const Preset* d = defaultPreset();
    CHECK(d != nullptr && d->id == 1);
    const Preset* g = findPreset(3);
    CHECK(g && g->photosensitiveConsentRequired);
    PresetPlayer pl;
    ShdCcpPacket out;
    pl.start(d, 0);
    CHECK(pl.update(0, out) && out.fe == 10.0f && out.rampMs == 5000);
    CHECK(!pl.update(1000, out));
    const uint32_t firstStep = d->steps[0].rampMs + d->steps[0].holdMs;
    CHECK(pl.update(firstStep, out) && pl.stepIndex() == 1);
    CHECK_NEAR(out.fe, 7.83f, 1e-4);
    uint32_t t = firstStep;
    for (int i = 0; i < 20; ++i) { t += 3600000; pl.update(t, out); }
    CHECK(!pl.running());   // non-looping preset finishes
}
