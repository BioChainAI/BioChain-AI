# Biopuck Audio: Firmware & System Architecture
## Core Design Document for Standalone & Biochain AI Operation

### 1. System Overview
The Biopuck is a dedicated acoustic node designed for spatial audio and brainwave entrainment. It operates without streaming audio files. Instead, it utilizes a local **Geometric Audio Engine**—a mathematically driven digital signal processing (DSP) core that generates binaural, isochronic, and spatial soundscapes dynamically.

#### Operating Modes
1.  **Biochain Connected (Mesh/Network):** The puck connects to the central Orchestrator. It awaits `shd-ccp` parameters to shape the sound and aligns its internal clock using the `pi6` handshake, allowing the Biochain AI to alter the audio based on real-time biofeedback.
2.  **Standalone (Offline):** The puck operates as an independent meditation generator, executing pre-loaded geometric sequences (e.g., "Deep Sleep Theta Protocol") from local memory.

---

### 2. Hardware Recommendations
To achieve zero-latency waveform calculation and high-fidelity audio, the following stack is recommended:
*   **Microcontroller (MCU):** ESP32-S3 (Dual-core, built-in Wi-Fi/BLE Mesh, vector instructions for fast math) or Teensy 4.0/4.1 (Powerful ARM Cortex-M7, exceptional for DSP).
*   **Audio Output:** I2S DAC (Digital-to-Analog Converter) such as the MAX98357A or PCM5102A to drive high-quality audio out to an omni-directional speaker or headphone jack.

---

### 3. The Geometric Audio Engine (Mathematical DSP)
The heart of the Biopuck is its ability to generate pure geometric waveforms. 

#### 3.1. Core Mathematical Generation
Rather than playing an MP3, the MCU calculates the amplitude of the audio signal at a standard sample rate (e.g., $44,100\text{ Hz}$). 

For a simple Binaural Beat, the engine calculates two waves based on a Carrier Frequency ($f_c$) and an Entrainment Frequency ($f_e$):
*   **Left Channel:** $$y_L(t) = A \sin(2\pi(f_c - f_e/2)t + \phi_L)$$
*   **Right Channel:** $$y_R(t) = A \sin(2\pi(f_c + f_e/2)t + \phi_R)$$

#### 3.2. Isochronic Pulsing Logic
For an omni-directional speaker (which cannot utilize binaural separation effectively), the engine uses Isochronic tones—pulsing a single frequency on and off.
*   **Amplitude Modulation:** $$y(t) = [A \sin(2\pi f_c t)] \times [0.5 + 0.5 \sin(2\pi f_e t)]$$
    *(This creates a smooth volume pulse at the entrainment frequency without harsh clicking).*

---

### 4. Networking & The `pi6` Handshake Protocol
When connected to the Biochain ecosystem, the puck uses UDP or ESP-NOW (for ultra-low latency mesh) to receive `shd-ccp` packets.

#### 4.1. The `shd-ccp` Packet Structure
A typical lightweight data packet (e.g., JSON or byte array) sent by the Biochain AI:
```json
{
  "cmd": "update_geo",
  "fc": 432.0,       // Carrier Frequency (Hz)
  "fe": 7.83,        // Entrainment Frequency (Hz - e.g., Schumann Resonance)
  "amp": 0.8,        // Target Amplitude (0.0 to 1.0)
  "pan": 0.0,        // Spatial Pan (-1.0 to 1.0)
  "ramp_ms": 5000    // Transition time to smoothly glide to these settings
}
```

#### 4.2. Implementing the `pi6` Sync Handshake
To prevent audio artifacts, the Biopuck **never** instantly resets its timer. If the Biochain AI sends a sync packet indicating that the master phase is at $\pi/6$, the puck executes a "slew".

1.  **Calculate Phase Error:** $$\Delta \theta = \theta_{target} - \theta_{local}$$
2.  **Smooth Slew:** If $\Delta \theta$ is non-zero, the puck temporarily micro-adjusts its clock speed ($t_{step}$) over the next few milliseconds until the phases align perfectly.

---

### 5. Core Firmware Logic (C++ Pseudo-Code Structure)

```cpp
// Biopuck Core Geometric Engine Loop
// Designed for a dual-core MCU (Core 0 handles network, Core 1 handles Audio)

float carrierFreq = 432.0; 
float entrainmentFreq = 4.0; // Theta
float currentPhase = 0.0;
float sampleRate = 44100.0;

// This runs constantly, pushing data to the I2S DAC
void generateAudioBuffer(int16_t* buffer, int numSamples) {
    for (int i = 0; i < numSamples; i++) {
        // Calculate the phase increment per sample
        float phaseIncrement = (TWO_PI * carrierFreq) / sampleRate;
        currentPhase += phaseIncrement;
        
        // Wrap phase to prevent float overflow
        if (currentPhase > TWO_PI) currentPhase -= TWO_PI;
        
        // Generate Isochronic base wave
        float isochronicModulator = 0.5 + 0.5 * sin((TWO_PI * entrainmentFreq * millis()) / 1000.0);
        float sampleValue = sin(currentPhase) * isochronicModulator;
        
        // Convert float (-1.0 to 1.0) to 16-bit integer for DAC
        int16_t outSample = (int16_t)(sampleValue * 32767);
        buffer[i] = outSample; 
    }
}

// Called by Network thread when a pi6 packet arrives
void handlePi6Handshake(float masterPhase) {
    float phaseDiff = masterPhase - currentPhase;
    
    // Smoothly slew the phase over the next audio frames 
    // rather than abruptly setting currentPhase = masterPhase;
    slewPhase(phaseDiff, 50); // Slew over 50ms to prevent audio pops
}

void loop() {
    if (networkMode) {
        listenForBiochainPackets(); // AI sends shd-ccp updates based on biofeedback
    } else {
        runStandaloneMeditationSequence(); // Runs local preset arrays
    }
}
```

### 6. Biochain AI Integration Workflow
1.  **Baseline:** User wears HRV/EEG sensor connected to Biochain Control Panel.
2.  **Initialize:** Control panel sends `shd-ccp` to Biopuck setting it to $432\text{ Hz}$ carrier with $10\text{ Hz}$ Alpha entrainment.
3.  **Biofeedback Loop:** The AI detects the user is highly stressed (low HRV).
4.  **Dynamic Adjustment:** The AI sends a new `shd-ccp` packet to smoothly ramp the carrier to $396\text{ Hz}$ (solfeggio root) and drops the entrainment frequency down to a deeply calming $4\text{ Hz}$ Theta over a 15-second `ramp_ms` window.
5.  **Synchronization:** The AI periodically broadcasts the `pi6` handshake so all Biopucks in the room maintain perfect mathematical harmony.