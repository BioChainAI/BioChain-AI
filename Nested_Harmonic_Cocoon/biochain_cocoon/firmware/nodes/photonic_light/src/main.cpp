// Photonic Puck: Node Type B (650 nm photobiomodulation).
//
// The light level is amp × smoothPulse(entrainment phase). The phase comes
// from the same EntrainmentClock the audio pucks use, so light pulses land on
// the audio beat once pi6 has aligned them. Safety (shared_core/safety) has
// already zeroed `amp` for pulsed light in the 3–60 Hz photosensitive band
// unless the session or device carries consent.
#include <Arduino.h>
#include "node_config.h"
#include "geometric_engine/entrainment_clock.h"
#include "geometric_engine/pulse_shaper.h"
#include "network_stack/arduino_node.h"
#include "safety/thermal.h"

using namespace cocoon;

namespace {
EntrainmentClock gClock(CONTROL_RATE_HZ, 10.0f);
Ramp gAmp(0.0f);
volatile uint8_t gMode = 4;    // 4 pulse, 5 continuous
float gLastErr = 0.0f;
portMUX_TYPE gMux = portMUX_INITIALIZER_UNLOCKED;

uint32_t msToTicks(uint32_t ms) { return ms * CONTROL_RATE_HZ / 1000; }

class LightApp : public PacketHandler {
public:
    void onUpdateGeo(const ShdCcpPacket& p) override {
        portENTER_CRITICAL(&gMux);
        gClock.setFrequency(p.fe, msToTicks(p.rampMs));
        gAmp.setTarget(p.amp, msToTicks(p.rampMs));
        gMode = p.mode;
        portEXIT_CRITICAL(&gMux);
    }
    void onPi6Sync(float t, uint8_t, uint32_t slewMs) override {
        portENTER_CRITICAL(&gMux);
        gClock.syncTo(t, msToTicks(slewMs));
        gLastErr = gClock.lastError() * kTwoPi;
        portEXIT_CRITICAL(&gMux);
    }
    void onPlayPreset(uint16_t) override {}
    void onStop(uint32_t fadeMs) override {
        portENTER_CRITICAL(&gMux);
        gAmp.setTarget(0.0f, msToTicks(fadeMs));
        portEXIT_CRITICAL(&gMux);
    }
};

LightApp gApp;
RuntimeConfig makeConfig() {
    RuntimeConfig c; c.nodeId = COCOON_NODE_ID; c.type = NodeType::Photonic; c.modality = kPhotonic;
    return c;
}
NodeRuntime gRuntime(makeConfig(), gApp);
ThermalGuard gThermal(PIN_NTC_ADC, LED_THERMAL_CUTOFF_C);
// Control loop runs as a pinned FreeRTOS task, not a timer ISR: Xtensa does not
// save FPU state in ISRs by default, and this loop is all float math.
void controlTask(void*) {
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        portENTER_CRITICAL(&gMux);
        const float ph = gClock.tick();
        const float a = gAmp.next();
        const uint8_t mode = gMode;
        portEXIT_CRITICAL(&gMux);
        float level = mode == 5 ? a : a * smoothPulse(ph, 0.5f);
        if (gThermal.tripped()) level = 0.0f;
        ledcWrite(PIN_LED_DIM, static_cast<uint32_t>(level * ((1 << LED_PWM_BITS) - 1)));
        xTaskDelayUntil(&last, pdMS_TO_TICKS(1000 / CONTROL_RATE_HZ));
    }
}
}  // namespace

void setup() {
    ledcAttach(PIN_LED_DIM, LED_PWM_HZ, LED_PWM_BITS);
    ledcWrite(PIN_LED_DIM, 0);
    xTaskCreatePinnedToCore(controlTask, "light", 3072, nullptr, configMAX_PRIORITIES - 2, nullptr, 1);

    ArduinoNodeOptions o{"cocoon-photonic-light"};
    if (sizeof(COCOON_WIFI_SSID) > 1) { o.wifiSsid = COCOON_WIFI_SSID; o.wifiPass = COCOON_WIFI_PASS; }
    o.consentButtonPin = PIN_CONSENT_BTN;
    o.statusLedPin = PIN_STATUS_LED;
    ArduinoNode::begin(gRuntime, o);
}

void loop() {
    gThermal.sample();
    ArduinoNode::service(gLastErr, gThermal.celsius());
    delay(5);
}
