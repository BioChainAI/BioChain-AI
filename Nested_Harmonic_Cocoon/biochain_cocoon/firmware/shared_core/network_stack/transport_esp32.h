// ESP32 transports: ESP-NOW (primary, lowest latency) and UDP broadcast
// (fallback over Wi-Fi). Compiled only for Arduino-ESP32 targets. The host
// build and the unit tests never include it.
#pragma once
#ifdef ARDUINO
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_now.h>
#include "packet_router.h"

namespace cocoon {

constexpr uint16_t kUdpPort = 47632;   // shd-ccp default port

// Plain function pointer: no std::function / heap on the Wi-Fi path.
using PacketSink = void (*)(const uint8_t* data, size_t len, uint32_t nowMs);

class Esp32Transport {
public:
    static Esp32Transport& instance() { static Esp32Transport t; return t; }

    // ESP-NOW receive runs in the Wi-Fi task. Copy the frame into a ring
    // buffer; the network core drains it through poll().
    // `sink` is any object with feed(const uint8_t*, size_t, uint32_t), normally
    // the NodeRuntime. Kept generic so testbeds can hand in a bare PacketRouter.
    bool beginEspNow(PacketSink sink, uint8_t channel = 1) {
        sink_ = sink;
        WiFi.mode(WIFI_STA);
        WiFi.disconnect();
        if (esp_now_init() != ESP_OK) return false;
        esp_now_register_recv_cb(&Esp32Transport::onRecv);
        esp_now_peer_info_t peer{};
        memset(peer.peer_addr, 0xFF, 6);          // broadcast peer for Announce/Telemetry
        peer.channel = channel;
        peer.encrypt = false;
        esp_now_add_peer(&peer);
        return true;
    }

    bool beginUdp(PacketSink sink, const char* ssid, const char* pass, uint32_t timeoutMs = 10000) {
        sink_ = sink;
        WiFi.mode(WIFI_STA);
        WiFi.begin(ssid, pass);
        uint32_t t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) delay(100);
        if (WiFi.status() != WL_CONNECTED) return false;
        udpActive_ = udp_.begin(kUdpPort);
        return udpActive_;
    }

    void poll() {
        uint8_t buf[kPacketSize];
        if (!sink_) return;
        while (pop(buf)) sink_(buf, kPacketSize, millis());
        if (udpActive_) {
            int n = udp_.parsePacket();
            while (n > 0) {
                int got = udp_.read(buf, sizeof(buf));
                if (got > 0) sink_(buf, static_cast<size_t>(got), millis());
                n = udp_.parsePacket();
            }
        }
    }

    void send(const ShdCcpPacket& p) {
        uint8_t buf[kPacketSize];
        encodePacket(p, buf);
        static const uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
        esp_now_send(bcast, buf, kPacketSize);
        if (udpActive_) {
            udp_.beginPacket(IPAddress(255, 255, 255, 255), kUdpPort);
            udp_.write(buf, kPacketSize);
            udp_.endPacket();
        }
    }

private:
    static constexpr int kRing = 16;
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    static void onRecv(const esp_now_recv_info_t*, const uint8_t* data, int len) { enqueue(data, len); }
#else
    static void onRecv(const uint8_t*, const uint8_t* data, int len) { enqueue(data, len); }
#endif
    static void enqueue(const uint8_t* data, int len) {
        if (len != static_cast<int>(kPacketSize)) return;
        auto& t = instance();
        int next = (t.head_ + 1) % kRing;
        if (next == t.tail_) return;              // full: drop newest, never block the Wi-Fi task
        memcpy(t.ring_[t.head_], data, kPacketSize);
        t.head_ = next;
    }
    bool pop(uint8_t* out) {
        if (tail_ == head_) return false;
        memcpy(out, ring_[tail_], kPacketSize);
        tail_ = (tail_ + 1) % kRing;
        return true;
    }

    PacketSink sink_ = nullptr;
    WiFiUDP udp_;
    bool udpActive_ = false;
    uint8_t ring_[kRing][kPacketSize];
    volatile int head_ = 0, tail_ = 0;
};

}  // namespace cocoon
#endif  // ARDUINO
