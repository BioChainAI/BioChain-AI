// Bifilar coil resonance + thermal characterisation.
// Sweeps the H-bridge carrier from F_START to F_STOP at a fixed duty, and
// reads coil current (INA219 over I2C, or a shunt on ADC) and NTC
// temperature. Emits CSV for the analysis notebook:
//   freq_hz,duty,current_ma,temp_c,pickup_mv
// A search coil (pickup) on ADC PIN_PICKUP gives the relative field magnitude,
// the number that actually matters when comparing windings and crystals.
#include <Arduino.h>
#include <Wire.h>
#include <driver/ledc.h>
#include "safety/thermal.h"

#define PIN_IN1 9
#define PIN_IN2 10
#define PIN_NTC 4
#define PIN_PICKUP 5
#define PIN_SHUNT 6        // fallback current sense: 0.1 Ω shunt + 20× amp → mV/2 = mA
constexpr uint32_t F_START = 50, F_STOP = 20000;
constexpr int STEPS = 120, BITS = 10;
constexpr float DUTY = 0.20f, CUTOFF_C = 45.0f;

cocoon::ThermalGuard thermal(PIN_NTC, CUTOFF_C);

void drive(float duty) {
    uint32_t raw = static_cast<uint32_t>(duty * ((1 << BITS) - 1));
    ledcWrite(PIN_IN1, raw);
    ledc_set_duty_with_hpoint(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, raw, 1u << (BITS - 1));
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
}

float rmsMilliVolts(int pin, int n = 200) {
    double s = 0;
    for (int i = 0; i < n; ++i) { float v = analogReadMilliVolts(pin); s += v * v; delayMicroseconds(50); }
    return sqrt(s / n);
}

void setup() {
    Serial.begin(921600);
    ledcAttachChannel(PIN_IN1, F_START, BITS, 0);
    ledcAttachChannel(PIN_IN2, F_START, BITS, 1);
    drive(0);
    delay(1000);
    Serial.println("freq_hz,duty,current_ma,temp_c,pickup_mv");
    for (int i = 0; i <= STEPS; ++i) {
        uint32_t f = static_cast<uint32_t>(F_START * powf(float(F_STOP) / F_START, float(i) / STEPS));
        ledcChangeFrequency(PIN_IN1, f, BITS);
        drive(DUTY);
        delay(250);                                   // settle
        thermal.sample();
        if (thermal.tripped()) { drive(0); Serial.println("# THERMAL CUTOFF, sweep aborted"); break; }
        float ma = rmsMilliVolts(PIN_SHUNT) / 2.0f;
        float pickup = rmsMilliVolts(PIN_PICKUP);
        Serial.printf("%u,%.2f,%.1f,%.1f,%.1f\n", (unsigned)f, DUTY, ma, thermal.celsius(), pickup);
    }
    drive(0);
    Serial.println("# done");
}

void loop() { delay(1000); }
