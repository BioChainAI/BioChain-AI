// Biopuck Audio: Node Type A (Sonic Ambisonic).
//
// Core 0: network (ESP-NOW/UDP intake, NodeRuntime, announce, OTA)
// Core 1: audio (GeometricAudioEngine → I2S DAC, never blocks on network)
//
// Parameter changes cross cores via a FreeRTOS queue, and the audio task
// applies them only between buffers. The render loop never takes a lock.
#include <Arduino.h>
#include <ESP_I2S.h>
#include "node_config.h"
#include "geometric_engine/geometric_audio_engine.h"
#include "network_stack/arduino_node.h"

using namespace cocoon;

namespace {

enum class AudioCmdType : uint8_t { Params, Sync, Stop };
struct AudioCmd {
    AudioCmdType type;
    AudioParams params;
    uint32_t ms;
    float turns;
};

QueueHandle_t gAudioQueue;
GeometricAudioEngine gEngine(static_cast<float>(COCOON_SAMPLE_RATE));
I2SClass gI2s;
volatile float gLastPhaseError = 0.0f;
float gLastAmp = 0.0f;

class AudioApp : public PacketHandler {
public:
    void onUpdateGeo(const ShdCcpPacket& p) override {
        AudioCmd c{AudioCmdType::Params, {}, p.rampMs, 0};
        c.params.carrierHz = p.fc;
        c.params.entrainHz = p.fe;
        c.params.amplitude = p.amp;
        c.params.pan = p.pan;
        c.params.mode = p.mode <= 2 ? static_cast<AudioMode>(p.mode) : AudioMode::Isochronic;
        xQueueSend(gAudioQueue, &c, 0);
    }
    void onPi6Sync(float turns, uint8_t, uint32_t slewMs) override {
        AudioCmd c{AudioCmdType::Sync, {}, slewMs, turns};
        xQueueSend(gAudioQueue, &c, 0);
    }
    void onPlayPreset(uint16_t) override {}   // NodeRuntime runs the preset
    void onStop(uint32_t fadeMs) override {
        AudioCmd c{AudioCmdType::Stop, {}, fadeMs, 0};
        xQueueSend(gAudioQueue, &c, 0);
    }
};

AudioApp gApp;
RuntimeConfig makeConfig() {
    RuntimeConfig c;
    c.nodeId = COCOON_NODE_ID;
    c.type = NodeType::SonicAmbisonic;
    c.modality = kAudio;
    return c;
}
NodeRuntime gRuntime(makeConfig(), gApp);

void audioTask(void*) {
    static int16_t buf[AUDIO_FRAMES_PER_BUFFER * 2];
    AudioParams current;
    bool unmuted = false;
    for (;;) {
        AudioCmd c;
        while (xQueueReceive(gAudioQueue, &c, 0) == pdTRUE) {
            switch (c.type) {
            case AudioCmdType::Params: current = c.params; gEngine.setParams(current, c.ms); break;
            case AudioCmdType::Sync:
                gEngine.syncEntrainment(c.turns, c.ms);
                gLastPhaseError = gEngine.clock().lastError() * kTwoPi;
                break;
            case AudioCmdType::Stop: current.amplitude = 0; gEngine.setParams(current, c.ms); break;
            }
        }
        gEngine.render(buf, AUDIO_FRAMES_PER_BUFFER);
        gI2s.write(reinterpret_cast<uint8_t*>(buf), sizeof(buf));   // blocks on DMA: paces the loop
        if (!unmuted) { digitalWrite(PIN_AMP_SD, HIGH); unmuted = true; }
    }
}

}  // namespace

void setup() {
    pinMode(PIN_AMP_SD, OUTPUT);
    digitalWrite(PIN_AMP_SD, LOW);          // silent until the first clean buffer
    gAudioQueue = xQueueCreate(16, sizeof(AudioCmd));

    gI2s.setPins(PIN_I2S_BCLK, PIN_I2S_LRCLK, PIN_I2S_DOUT);
    if (!gI2s.begin(I2S_MODE_STD, COCOON_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
        Serial.println("[biopuck] I2S init failed");
    }
    xTaskCreatePinnedToCore(audioTask, "audio", 4096, nullptr, configMAX_PRIORITIES - 1, nullptr, 1);

    ArduinoNodeOptions o{"cocoon-biopuck-audio"};
    if (sizeof(COCOON_WIFI_SSID) > 1) { o.wifiSsid = COCOON_WIFI_SSID; o.wifiPass = COCOON_WIFI_PASS; }
    o.consentButtonPin = PIN_CONSENT_BTN;
    o.statusLedPin = PIN_STATUS_LED;
    ArduinoNode::begin(gRuntime, o);
}

void loop() {
    ArduinoNode::service(gLastPhaseError, temperatureRead());
    delay(2);
}
