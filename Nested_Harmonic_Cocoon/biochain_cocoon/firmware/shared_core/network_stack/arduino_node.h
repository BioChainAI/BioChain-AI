// Glue shared by every node's main.cpp on Arduino-ESP32: transport bring-up,
// the static packet sink, Announce broadcasting, OTA, and the long-press
// photosensitive consent toggle stored in NVS. Nodes stay small: each one
// supplies its PacketHandler and a control-loop body.
#pragma once
#ifdef ARDUINO
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include "node_runtime.h"
#include "transport_esp32.h"

#ifndef COCOON_NODE_ID
#define COCOON_NODE_ID 1
#endif
#ifndef COCOON_FW_VERSION
#define COCOON_FW_VERSION "dev"
#endif

namespace cocoon {

struct ArduinoNodeOptions {
    const char* hostname;           // mDNS name for OTA, e.g. "cocoon-biopuck_audio"
    const char* wifiSsid = nullptr; // nullptr → ESP-NOW only (no OTA, no UDP)
    const char* wifiPass = nullptr;
    int consentButtonPin = 0;       // BOOT button on DevKitC; hold 3 s to toggle
    int statusLedPin = -1;
};

class ArduinoNode {
public:
    static NodeRuntime*& runtime() { static NodeRuntime* r = nullptr; return r; }

    static void sink(const uint8_t* d, size_t n, uint32_t now) {
        if (runtime()) runtime()->feed(d, n, now);
    }

    static void begin(NodeRuntime& rt, const ArduinoNodeOptions& o) {
        opts() = o;
        runtime() = &rt;
        Serial.begin(115200);
        Serial.printf("[cocoon] node %u fw %s booting\n", COCOON_NODE_ID, COCOON_FW_VERSION);

        Preferences prefs;
        prefs.begin("cocoon", true);
        rt.setLocalConsent(prefs.getBool("photoConsent", false));
        prefs.end();
        pinMode(o.consentButtonPin, INPUT_PULLUP);
        if (o.statusLedPin >= 0) pinMode(o.statusLedPin, OUTPUT);

        auto& t = Esp32Transport::instance();
        bool udp = o.wifiSsid && t.beginUdp(&ArduinoNode::sink, o.wifiSsid, o.wifiPass);
        if (udp) {
            ArduinoOTA.setHostname(o.hostname);
            ArduinoOTA.begin();
            Serial.printf("[cocoon] UDP + OTA on %s\n", WiFi.localIP().toString().c_str());
        }
        // ESP-NOW works alongside a station connection on the same channel.
        t.beginEspNow(&ArduinoNode::sink, udp ? WiFi.channel() : 1);
        rt.begin(millis());
    }

    // Call every loop() on the network core.
    static void service(float phaseErrorRad = 0.0f, float temperatureC = 0.0f) {
        auto& t = Esp32Transport::instance();
        t.poll();
        ArduinoOTA.handle();
        NodeRuntime& rt = *runtime();
        if (rt.update(millis())) t.send(rt.announcePacket(phaseErrorRad, temperatureC));
        pollConsentButton(rt);
        if (opts().statusLedPin >= 0)   // solid = connected, slow blink = standalone
            digitalWrite(opts().statusLedPin,
                         rt.state() == LinkState::Connected ? HIGH : ((millis() / 1000) & 1));
    }

private:
    static ArduinoNodeOptions& opts() { static ArduinoNodeOptions o{"cocoon-node"}; return o; }

    static void pollConsentButton(NodeRuntime& rt) {
        static uint32_t downSince = 0;
        static bool handled = false;
        if (digitalRead(opts().consentButtonPin) == LOW) {
            if (!downSince) downSince = millis();
            if (!handled && millis() - downSince > 3000) {
                handled = true;
                Preferences prefs;
                prefs.begin("cocoon", false);
                bool c = !prefs.getBool("photoConsent", false);
                prefs.putBool("photoConsent", c);
                prefs.end();
                rt.setLocalConsent(c);
                Serial.printf("[cocoon] photosensitive consent %s\n", c ? "GRANTED" : "revoked");
            }
        } else { downSince = 0; handled = false; }
    }
};

}  // namespace cocoon
#endif  // ARDUINO
