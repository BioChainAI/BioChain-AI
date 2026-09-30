// Photonic Puck pin map. ESP32-S3 + constant-current LED driver (e.g. PT4115)
// on a 650 nm LED array; PWM on the driver's DIM pin.
#pragma once
#define PIN_LED_DIM       5
#define PIN_NTC_ADC       4    // 10k NTC on the LED heatsink
#define PIN_STATUS_LED    2
#define PIN_CONSENT_BTN   0

#define LED_PWM_HZ        19531   // well above visible PWM flicker; 12-bit at 80 MHz / 4096
#define LED_PWM_BITS      12
#define CONTROL_RATE_HZ   1000    // envelope rate = FreeRTOS tick (1 kHz); ≥ 22 steps per 45 Hz cycle
#define LED_THERMAL_CUTOFF_C 60.0f

#ifndef COCOON_WIFI_SSID
#define COCOON_WIFI_SSID ""
#define COCOON_WIFI_PASS ""
#endif
