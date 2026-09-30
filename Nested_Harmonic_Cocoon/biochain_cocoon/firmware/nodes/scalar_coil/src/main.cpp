// Scalar Coil Puck: Node Type D (EXPERIMENTAL, subtle-energy research).
//
// Drives a bifilar pancake coil with an alternating (bipolar) pulse carrier
// at fc (the "PWM base Hz" field), gated by a smooth burst envelope at fe.
// IN1 pulses at the start of each carrier period and IN2 pulses half a period
// later (LEDC hpoint offset), so current alternates direction with zero net DC.
// At zero duty both inputs are low (coast). The drive duty is capped by SafetyLimits::maxCoilDuty and the
// NTC thermal cutoff.
//
// The scalar-wave and chakra-alignment claims in the system spec have no
// validated physiological mechanism. This node is a controllable, measurable
// research instrument. Tune it in firmware/testbeds/bifilar_resonance_test first.
#include <Arduino.h>
#include <driver/ledc.h>
#include "node_config.h"
#include "geometric_engine/entrainment_clock.h"
#include "geometric_engine/pulse_shaper.h"
#include "network_stack/arduino_node.h"
#include "safety/thermal.h"

using namespace cocoon;

namespace {
EntrainmentClock gClock(CONTROL_RATE_HZ, 7.83f);
Ramp gDuty(0.0f);
volatile uint8_t gMode = 4;
volatile uint32_t gCarrierHz = 432;
float gLastErr = 0.0f;
portMUX_TYPE gMux = portMUX_INITIALIZER_UNLOCKED;
ThermalGuard gThermal(PIN_NTC_ADC, COIL_THERMAL_CUTOFF_C);

uint32_t msToTicks(uint32_t ms) { return ms * CONTROL_RATE_HZ / 1000; }

void setCarrier(uint32_t hz) {
    // Both channels share one LEDC timer, so their periods stay locked.
    ledcChangeFrequency(PIN_COIL_IN1, hz, COIL_PWM_BITS);
}

// Duty ≤ maxCoilDuty (0.35) < 0.5, so the IN1 and IN2 pulses never overlap.
void writeBipolar(uint32_t raw) {
    ledcWrite(PIN_COIL_IN1, raw);                                   // hpoint 0
    ledc_set_duty_with_hpoint(LEDC_LOW_SPEED_MODE, static_cast<ledc_channel_t>(COIL_CH_IN2),
                              raw, 1u << (COIL_PWM_BITS - 1));      // hpoint = half period
    ledc_update_duty(LEDC_LOW_SPEED_MODE, static_cast<ledc_channel_t>(COIL_CH_IN2));
}

class CoilApp : public PacketHandler {
public:
    void onUpdateGeo(const ShdCcpPacket& p) override {
        portENTER_CRITICAL(&gMux);
        gClock.setFrequency(p.fe, msToTicks(p.rampMs));
        gDuty.setTarget(p.amp, msToTicks(p.rampMs));    // already capped at maxCoilDuty
        gMode = p.mode;
        portEXIT_CRITICAL(&gMux);
        const uint32_t hz = static_cast<uint32_t>(p.fc);
        if (hz != gCarrierHz) { gCarrierHz = hz; setCarrier(hz); }
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
        gDuty.setTarget(0.0f, msToTicks(fadeMs));
        portEXIT_CRITICAL(&gMux);
    }
};

CoilApp gApp;
RuntimeConfig makeConfig() {
    RuntimeConfig c; c.nodeId = COCOON_NODE_ID; c.type = NodeType::ScalarCoil; c.modality = kCoil;
    return c;
}
NodeRuntime gRuntime(makeConfig(), gApp);

void controlTask(void*) {
    TickType_t last = xTaskGetTickCount();
    const SafetyLimits limits;
    for (;;) {
        portENTER_CRITICAL(&gMux);
        const float ph = gClock.tick();
        const float d = gDuty.next();
        const uint8_t mode = gMode;
        portEXIT_CRITICAL(&gMux);
        float duty = mode == 5 ? d : d * smoothPulse(ph, 0.5f);
        if (duty > limits.maxCoilDuty) duty = limits.maxCoilDuty;   // belt and braces
        if (gThermal.tripped()) duty = 0.0f;
        const uint32_t raw = static_cast<uint32_t>(duty * ((1 << COIL_PWM_BITS) - 1));
        writeBipolar(raw);
        xTaskDelayUntil(&last, pdMS_TO_TICKS(1000 / CONTROL_RATE_HZ));
    }
}
}  // namespace

void setup() {
    // Channels 0 and 1 share LEDC timer 0 (channel n uses timer n/2).
    ledcAttachChannel(PIN_COIL_IN1, gCarrierHz, COIL_PWM_BITS, COIL_CH_IN1);
    ledcAttachChannel(PIN_COIL_IN2, gCarrierHz, COIL_PWM_BITS, COIL_CH_IN2);
    writeBipolar(0);
    xTaskCreatePinnedToCore(controlTask, "coil", 3072, nullptr, configMAX_PRIORITIES - 2, nullptr, 1);

    ArduinoNodeOptions o{"cocoon-scalar-coil"};
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
