// Scalar Coil Puck pin map. ESP32-S3 + DRV8871 H-bridge driving a bifilar
// pancake coil (hardware/production/scalar_coil_rev_1.0). A resonant crystal
// (quartz/amethyst) sits in the centre cradle. An NTC on the coil former
// provides thermal cutoff.
#pragma once
#define PIN_COIL_IN1      9
#define PIN_COIL_IN2      10
#define PIN_NTC_ADC       4
#define PIN_STATUS_LED    2
#define PIN_CONSENT_BTN   0

#define COIL_PWM_BITS     10
#define COIL_CH_IN1       0      // LEDC channels 0/1 share timer 0
#define COIL_CH_IN2       1
#define CONTROL_RATE_HZ   1000
#define COIL_THERMAL_CUTOFF_C 45.0f   // matches SafetyLimits::coilThermalCutoffC

#ifndef COCOON_WIFI_SSID
#define COCOON_WIFI_SSID ""
#define COCOON_WIFI_PASS ""
#endif
