// Mesh Gateway: transparent SLIP-over-USB ↔ ESP-NOW broadcast bridge.
// Host → gateway: SLIP frames (RFC 1055), each one 52-byte shd-ccp packet.
// Gateway → host: every valid shd-ccp frame heard on ESP-NOW (Announce/Telemetry).
// Frames are CRC-checked in both directions, so the gateway never relays garbage.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include "protocol/shdccp_packet.h"

using namespace cocoon;
constexpr uint8_t END = 0xC0, ESC = 0xDB, ESC_END = 0xDC, ESC_ESC = 0xDD;
const uint8_t kBcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

QueueHandle_t rxQueue;
struct Frame { uint8_t b[kPacketSize]; };

void enqueue(const uint8_t* d, int n) {
    if (n != static_cast<int>(kPacketSize)) return;
    Frame f; memcpy(f.b, d, kPacketSize);
    xQueueSend(rxQueue, &f, 0);
}
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
void onRecv(const esp_now_recv_info_t*, const uint8_t* d, int n) { enqueue(d, n); }
#else
void onRecv(const uint8_t*, const uint8_t* d, int n) { enqueue(d, n); }
#endif

void slipWrite(const uint8_t* d, size_t n) {
    Serial.write(END);
    for (size_t i = 0; i < n; ++i) {
        if (d[i] == END) { Serial.write(ESC); Serial.write(ESC_END); }
        else if (d[i] == ESC) { Serial.write(ESC); Serial.write(ESC_ESC); }
        else Serial.write(d[i]);
    }
    Serial.write(END);
}

void setup() {
    Serial.begin(921600);
    rxQueue = xQueueCreate(32, sizeof(Frame));
    WiFi.mode(WIFI_STA);
    esp_now_init();
    esp_now_register_recv_cb(onRecv);
    esp_now_peer_info_t peer{}; memcpy(peer.peer_addr, kBcast, 6); peer.channel = 1;
    esp_now_add_peer(&peer);
}

void loop() {
    static uint8_t buf[128]; static size_t len = 0; static bool esc = false;
    while (Serial.available()) {
        uint8_t c = Serial.read();
        if (c == END) {
            ShdCcpPacket p;
            if (len == kPacketSize && decodePacket(buf, len, p) == DecodeResult::Ok)
                esp_now_send(kBcast, buf, kPacketSize);
            len = 0; esc = false;
        } else if (esc) {
            if (len < sizeof(buf)) buf[len++] = c == ESC_END ? END : c == ESC_ESC ? ESC : c;
            esc = false;
        } else if (c == ESC) esc = true;
        else if (len < sizeof(buf)) buf[len++] = c;
    }
    Frame f;
    while (xQueueReceive(rxQueue, &f, 0) == pdTRUE) {
        ShdCcpPacket p;
        if (decodePacket(f.b, kPacketSize, p) == DecodeResult::Ok) slipWrite(f.b, kPacketSize);
    }
    delay(1);
}
