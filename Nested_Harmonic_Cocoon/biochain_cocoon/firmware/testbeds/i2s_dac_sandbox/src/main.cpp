// I2S DAC sandbox. Exercises a candidate DAC with the real GeometricAudioEngine.
// Serial commands (115200+ baud, newline terminated):
//   s  : log-sweep carrier 40 → 1500 Hz over 20 s (frequency response by ear / scope)
//   b  : binaural 432/10 Hz          i : isochronic 432/10 Hz
//   p  : pop test (mute → unmute 10×, listen for clicks)
//   0-9: amplitude 0.0-0.9           r : report underruns + render time
#include <Arduino.h>
#include <ESP_I2S.h>
#include "geometric_engine/geometric_audio_engine.h"

using namespace cocoon;

#define PIN_BCLK 12
#define PIN_LRCK 11
#define PIN_DOUT 13
#define PIN_SD   14
constexpr int SR = 44100, FRAMES = 256;

I2SClass i2s;
GeometricAudioEngine engine(SR);
AudioParams params{432.0f, 10.0f, 0.3f, 0.0f, AudioMode::Isochronic};
volatile uint32_t maxRenderUs = 0, underruns = 0;
bool sweeping = false; uint32_t sweepStart = 0;

void audioTask(void*) {
    static int16_t buf[FRAMES * 2];
    const uint32_t budgetUs = 1000000UL * FRAMES / SR;
    for (;;) {
        uint32_t t0 = micros();
        engine.render(buf, FRAMES);
        uint32_t dt = micros() - t0;
        if (dt > maxRenderUs) maxRenderUs = dt;
        if (dt > budgetUs) underruns = underruns + 1;
        i2s.write(reinterpret_cast<uint8_t*>(buf), sizeof(buf));
    }
}

void setup() {
    Serial.begin(921600);
    pinMode(PIN_SD, OUTPUT); digitalWrite(PIN_SD, HIGH);
    i2s.setPins(PIN_BCLK, PIN_LRCK, PIN_DOUT);
    i2s.begin(I2S_MODE_STD, SR, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
    engine.setParams(params, 500);
    xTaskCreatePinnedToCore(audioTask, "audio", 4096, nullptr, configMAX_PRIORITIES - 1, nullptr, 1);
    Serial.println("i2s_dac_sandbox ready: s b i p 0-9 r");
}

void loop() {
    if (sweeping) {
        float t = (millis() - sweepStart) / 20000.0f;
        if (t >= 1.0f) { sweeping = false; Serial.println("sweep done"); }
        else { params.carrierHz = 40.0f * powf(1500.0f / 40.0f, t); engine.setParams(params, 20); }
    }
    while (Serial.available()) {
        char c = Serial.read();
        if (c == 's') { sweeping = true; sweepStart = millis(); params.mode = AudioMode::Isochronic; }
        else if (c == 'b') { params = {432, 10, params.amplitude, 0, AudioMode::Binaural}; engine.setParams(params, 1000); }
        else if (c == 'i') { params = {432, 10, params.amplitude, 0, AudioMode::Isochronic}; engine.setParams(params, 1000); }
        else if (c == 'p') {
            for (int k = 0; k < 10; ++k) { digitalWrite(PIN_SD, LOW); delay(300); digitalWrite(PIN_SD, HIGH); delay(300); }
        } else if (c >= '0' && c <= '9') { params.amplitude = (c - '0') / 10.0f; engine.setParams(params, 250); }
        else if (c == 'r') Serial.printf("render_max_us=%u budget_us=%u underruns=%u\n",
                                         (unsigned)maxRenderUs, (unsigned)(1000000UL * FRAMES / SR), (unsigned)underruns);
    }
    delay(20);
}
