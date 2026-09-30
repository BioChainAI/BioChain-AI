// Haptic EMDR Puck pin map. ESP32-S3 + DRV8833 dual H-bridge driving two
// coin ERM/LRA motors. One puck carries a LEFT/RIGHT pair; for body-wide
// layouts, pair pucks and set COCOON_HAPTIC_SIDE per puck.
#pragma once
#define PIN_MOTOR_LEFT    6
#define PIN_MOTOR_RIGHT   7
#define PIN_DRV_SLEEP     8     // DRV8833 nSLEEP: LOW = motors unpowered
#define PIN_STATUS_LED    2
#define PIN_CONSENT_BTN   0

#define MOTOR_PWM_HZ      20000  // inaudible PWM carrier
#define MOTOR_PWM_BITS    10
#define CONTROL_RATE_HZ   1000
#define MOTOR_KICK_FLOOR  0.18f  // below this an ERM stalls; levels map into [floor, 1]

// 0 = drive both sides (single puck, alternating); 1 = left only; 2 = right only
#ifndef COCOON_HAPTIC_SIDE
#define COCOON_HAPTIC_SIDE 0
#endif

#ifndef COCOON_WIFI_SSID
#define COCOON_WIFI_SSID ""
#define COCOON_WIFI_PASS ""
#endif
