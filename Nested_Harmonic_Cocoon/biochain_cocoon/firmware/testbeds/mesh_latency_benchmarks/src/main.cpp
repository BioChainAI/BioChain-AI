// ESP-NOW mesh stress test. Flash the same image to N boards. The board with
// GPIO0 held LOW at boot becomes the MASTER; every other board is a REFLECTOR.
//   MASTER: sends shd-ccp Pi6Sync packets at RATE_HZ (seq increments; the
//           ramp_ms field is repurposed to carry the send timestamp in µs).
//   REFLECTOR: decodes each packet (full CRC path) and echoes it back as Telemetry.
// The master prints per-second stats as CSV:
//   t_s,sent,echoed,loss_pct,rtt_p50_us,rtt_p99_us,rtt_max_us
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <algorithm>
#include <vector>
#include "protocol/shdccp_packet.h"

using namespace cocoon;
constexpr int RATE_HZ = 200;
bool master = false;
uint16_t seq = 1;
uint32_t sent = 0, echoed = 0;
std::vector<uint32_t> rtts;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
const uint8_t kBcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

void sendPacket(const ShdCcpPacket& p) {
    uint8_t b[kPacketSize]; encodePacket(p, b); esp_now_send(kBcast, b, kPacketSize);
}

void onRecv(const esp_now_recv_info_t*, const uint8_t* d, int n) {
    ShdCcpPacket p;
    if (decodePacket(d, n, p) != DecodeResult::Ok) return;
    if (master && p.cmd == Command::Telemetry) {
        uint32_t rtt = micros() - p.rampMs;               // rampMs carries the µs timestamp
        portENTER_CRITICAL(&mux); rtts.push_back(rtt); echoed++; portEXIT_CRITICAL(&mux);
    } else if (!master && p.cmd == Command::Pi6Sync) {
        p.cmd = Command::Telemetry;
        sendPacket(p);
    }
}

void setup() {
    Serial.begin(921600);
    pinMode(0, INPUT_PULLUP);
    delay(50);
    master = digitalRead(0) == LOW;
    WiFi.mode(WIFI_STA);
    esp_now_init();
    esp_now_register_recv_cb(onRecv);
    esp_now_peer_info_t peer{}; memcpy(peer.peer_addr, kBcast, 6); peer.channel = 1;
    esp_now_add_peer(&peer);
    Serial.printf("# mesh_latency_benchmarks role=%s mac=%s\n", master ? "MASTER" : "REFLECTOR",
                  WiFi.macAddress().c_str());
    if (master) Serial.println("t_s,sent,echoed,loss_pct,rtt_p50_us,rtt_p99_us,rtt_max_us");
}

void loop() {
    if (!master) { delay(100); return; }
    static uint32_t lastSend = 0, lastReport = millis();
    if (micros() - lastSend >= 1000000 / RATE_HZ) {
        lastSend = micros();
        ShdCcpPacket p; p.cmd = Command::Pi6Sync; p.seq = seq++; if (!seq) seq = 1;
        p.aux = sent % 12; p.phase = (sent % 12) * 3.14159265f / 6; p.rampMs = lastSend;
        sendPacket(p); sent++;
    }
    if (millis() - lastReport >= 1000) {
        lastReport = millis();
        std::vector<uint32_t> r;
        uint32_t s, e;
        portENTER_CRITICAL(&mux); r.swap(rtts); s = sent; e = echoed; sent = echoed = 0; portEXIT_CRITICAL(&mux);
        std::sort(r.begin(), r.end());
        auto pct = [&](float q) { return r.empty() ? 0u : r[std::min(r.size() - 1, size_t(q * r.size()))]; };
        // With N reflectors, echoed ≈ N × sent; loss is reported per reflector-equivalent.
        Serial.printf("%lu,%u,%u,%.2f,%u,%u,%u\n", millis() / 1000, (unsigned)s, (unsigned)e,
                      s ? 100.0f * (1.0f - float(e) / s) : 0.0f, pct(0.5f), pct(0.99f), r.empty() ? 0u : r.back());
    }
}
