// Biopuck Audio pin map. ESP32-S3-DevKitC-1 + MAX98357A (or PCM5102A) I2S DAC.
// Matches hardware/prototypes/biopuck_breadboard/wiring.md.
#pragma once

#define PIN_I2S_BCLK     12
#define PIN_I2S_LRCLK    11
#define PIN_I2S_DOUT     13
#define PIN_AMP_SD       14   // MAX98357A shutdown: LOW = mute (held low until first render)
#define PIN_STATUS_LED    2
#define PIN_CONSENT_BTN   0   // BOOT button

#ifndef COCOON_SAMPLE_RATE
#define COCOON_SAMPLE_RATE 44100
#endif
#define AUDIO_FRAMES_PER_BUFFER 256   // 5.8 ms at 44.1 kHz

// Optional Wi-Fi for UDP fallback + OTA. Leave empty for ESP-NOW only.
#ifndef COCOON_WIFI_SSID
#define COCOON_WIFI_SSID ""
#define COCOON_WIFI_PASS ""
#endif
