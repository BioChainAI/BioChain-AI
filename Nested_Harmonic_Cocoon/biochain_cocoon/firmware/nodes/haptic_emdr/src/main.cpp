// Haptic EMDR Puck: Node Type C (bilateral somatosensory stimulation).
//
// mode 3 (bilateral): left and right taps alternate once per entrainment
// cycle. At fe = 1 Hz each side is tapped once a second, half a cycle apart.
// Any other mode pulses both motors together at fe (a synchronous "heartbeat").
// Because the taps come from the shared EntrainmentClock, two pucks on
// opposite sides of the body stay in strict alternation after pi6 sync.
#include <Arduino.h>
#include "node_config.h"
#include "geometric_engine/entrainment_clock.h"
#include "geometric_engine/pulse_shaper.h"
#include "network_stack/arduino_node.h"

using namespace cocoon;

namespace {
EntrainmentClock gClock(CONTROL_RATE_HZ, 1.0f);
Ramp gAmp(0.0f);
volatile uint8_t gMode = 3;
float gLastErr = 0.0f;
portMUX_TYPE gMux = portMUX_INITIALIZER_UNLOCKED;

uint32_t msToTicks(uint32_t ms) { return ms * CONTROL_RATE_HZ / 1000; }

uint32_t toDuty(float level) {
    if (level < 0.01f) return 0;
    const float mapped = MOTOR_KICK_FLOOR + (1.0f - MOTOR_KICK_FLOOR) * level;
    return static_cast<uint32_t>(mapped * ((1 << MOTOR_PWM_BITS) - 1));
}

class HapticApp : public PacketHandler {
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

HapticApp gApp;
RuntimeConfig makeConfig() {
    RuntimeConfig c; c.nodeId = COCOON_NODE_ID; c.type = NodeType::HapticEmdr; c.modality = kHaptic;
    c.autoStartPreset = false;   // haptics never start on their own at power-on
    return c;
}
NodeRuntime gRuntime(makeConfig(), gApp);

void controlTask(void*) {
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        portENTER_CRITICAL(&gMux);
        const float ph = gClock.tick();
        const float a = gAmp.next();
        const uint8_t mode = gMode;
        portEXIT_CRITICAL(&gMux);
        float l, r;
        if (mode == 3) { l = a * bilateralLevel(ph, false); r = a * bilateralLevel(ph, true); }
        else { l = r = a * smoothPulse(ph, 0.3f); }
        if (COCOON_HAPTIC_SIDE == 1) r = 0;
        if (COCOON_HAPTIC_SIDE == 2) l = 0;
        ledcWrite(PIN_MOTOR_LEFT, toDuty(l));
        ledcWrite(PIN_MOTOR_RIGHT, toDuty(r));
        digitalWrite(PIN_DRV_SLEEP, a > 0.01f ? HIGH : LOW);
        xTaskDelayUntil(&last, pdMS_TO_TICKS(1000 / CONTROL_RATE_HZ));
    }
}
}  // namespace

void setup() {
    pinMode(PIN_DRV_SLEEP, OUTPUT);
    digitalWrite(PIN_DRV_SLEEP, LOW);
    ledcAttach(PIN_MOTOR_LEFT, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
    ledcAttach(PIN_MOTOR_RIGHT, MOTOR_PWM_HZ, MOTOR_PWM_BITS);
    xTaskCreatePinnedToCore(controlTask, "haptic", 3072, nullptr, configMAX_PRIORITIES - 2, nullptr, 1);

    ArduinoNodeOptions o{"cocoon-haptic-emdr"};
    if (sizeof(COCOON_WIFI_SSID) > 1) { o.wifiSsid = COCOON_WIFI_SSID; o.wifiPass = COCOON_WIFI_PASS; }
    o.consentButtonPin = PIN_CONSENT_BTN;
    o.statusLedPin = PIN_STATUS_LED;
    ArduinoNode::begin(gRuntime, o);
}

void loop() {
    ArduinoNode::service(gLastErr, temperatureRead());
    delay(5);
}
