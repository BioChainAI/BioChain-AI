#include "test_harness.h"
#include "../shared_core/network_stack/node_runtime.h"

using namespace cocoon;

namespace {
struct App : PacketHandler {
    int geo = 0, pi6 = 0, stops = 0; ShdCcpPacket last;
    void onUpdateGeo(const ShdCcpPacket& p) override { ++geo; last = p; }
    void onPi6Sync(float, uint8_t, uint32_t) override { ++pi6; }
    void onPlayPreset(uint16_t) override {}
    void onStop(uint32_t) override { ++stops; }
};
void send(NodeRuntime& rt, ShdCcpPacket p, uint32_t now) {
    uint8_t b[kPacketSize]; encodePacket(p, b); rt.feed(b, kPacketSize, now);
}
}  // namespace

TEST(runtime_boots_standalone_then_connects_then_falls_back) {
    App app;
    RuntimeConfig cfg; cfg.nodeId = 5; cfg.modality = kAudio;
    NodeRuntime rt(cfg, app);
    rt.begin(0);
    rt.update(0);
    CHECK(rt.state() == LinkState::Standalone);
    CHECK(app.geo == 1 && rt.player().running());          // default preset step 0

    ShdCcpPacket p; p.cmd = Command::UpdateGeo; p.seq = 1; p.modality = kAudio; p.amp = 0.5f; p.rampMs = 1000;
    send(rt, p, 100);
    CHECK(rt.state() == LinkState::Connected);
    CHECK(!rt.player().running());
    CHECK(app.geo == 2);

    rt.update(100 + 8001);                                  // orchestrator silent
    CHECK(rt.state() == LinkState::Standalone && rt.linkLosses() == 1);
    CHECK(rt.player().running());
    CHECK(app.geo == 3);
}

TEST(runtime_photonic_preset_respects_local_consent) {
    App app;
    RuntimeConfig cfg; cfg.modality = kPhotonic; cfg.type = NodeType::Photonic; cfg.autoStartPreset = false;
    NodeRuntime rt(cfg, app);
    ShdCcpPacket play; play.cmd = Command::PlayPreset; play.seq = 1; play.aux = 3;   // gamma 40 Hz A/V
    send(rt, play, 0);
    rt.update(0);
    CHECK(app.geo == 1 && app.last.amp == 0.0f);            // dark without consent

    App app2;
    RuntimeConfig cfg2 = cfg; cfg2.localPhotosensitiveConsent = true;
    NodeRuntime rt2(cfg2, app2);
    send(rt2, play, 0);
    rt2.update(0);
    CHECK(app2.geo == 1 && app2.last.amp > 0.0f);
}

TEST(runtime_announce_packet) {
    App app; RuntimeConfig cfg; cfg.nodeId = 9; cfg.type = NodeType::ScalarCoil; cfg.modality = kCoil;
    NodeRuntime rt(cfg, app);
    CHECK(rt.update(2000));                                 // announce due
    ShdCcpPacket a = rt.announcePacket(0.01f, 31.5f);
    CHECK(a.cmd == Command::Announce && a.node == 9 && a.aux == 4);
    CHECK(a.flags & kFlagStandaloneFallback);
}

TEST(runtime_enforces_session_ceiling_until_explicit_stop) {
    App app;
    RuntimeConfig cfg; cfg.modality = kAudio; cfg.autoStartPreset = false;
    SafetyLimits L; L.maxSessionMs = 60000;
    NodeRuntime rt(cfg, app, L);
    ShdCcpPacket p; p.cmd = Command::UpdateGeo; p.modality = kAudio; p.amp = 0.5f; p.rampMs = 1000;
    uint16_t seq = 1;
    for (uint32_t t = 0; t <= 70000; t += 5000) {       // orchestrator keeps commanding
        p.seq = seq++; send(rt, p, t); rt.update(t);
    }
    CHECK(rt.lockedOut());
    CHECK(app.stops == 1);
    CHECK(app.last.amp == 0.0f);                         // further commands are muted
    ShdCcpPacket stop; stop.cmd = Command::Stop; stop.seq = seq++;
    send(rt, stop, 71000);
    CHECK(!rt.lockedOut());
    p.seq = seq++; send(rt, p, 72000);
    CHECK(app.last.amp > 0.0f);                          // new session re-armed
}
