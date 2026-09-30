# Omni-Resonance Modular Entrainment Network
## System Architecture & Concept Specification

### 1. Executive Summary
The Omni-Resonance System is a modular, mesh-networked full-body entrainment platform. It utilizes decentralized "pucks" (nodes) capable of delivering multi-modal therapy: omni-directional ambisonic sound, 650nm photobiomodulation, alternating vibrational EMDR, and electromagnetic crystal resonance. The system is governed by an AI-driven Central Orchestrator that uses biofeedback loops to dynamically adjust therapy states.

To preserve the integrity of the entrainment waves, the network relies on `shd-ccp` (Spatial Harmonic Data - Continuous Control Protocol) packets and a local "geometric timing" architecture, synchronized periodically via a `pi6` geometric handshake.

---

### 2. Hardware Modules (The "Pucks")
Each puck operates as an independent node within the mesh network, equipped with a local MCU (Microcontroller Unit), local clock, bio-sensors (optional), and specific therapeutic actuators. 

*   **Node Type A: Sonic Ambisonic Pucks**
    *   **Function:** Omni-directional sound generation.
    *   **Output:** Binaural beats, isochronic tones, and spatial audioscapes.
    *   **Data Handling:** Decodes spatial coordinates from `shd-ccp` packets to position audio perfectly in the 3D space around the user.
*   **Node Type B: Photonic Pucks**
    *   **Function:** Photobiomodulation.
    *   **Output:** 650nm (Red) light emitters. Pulsed at specific frequencies (e.g., Gamma 40Hz, Alpha 10Hz) synchronized with the audio entrainment.
*   **Node Type C: Haptic EMDR Pucks**
    *   **Function:** Somatosensory bilateral stimulation.
    *   **Output:** Precision vibrational motors. Configured in pairs across the body to facilitate tactile Eye Movement Desensitization and Reprocessing (EMDR) patterns.
*   **Node Type D: Electromagnetic / Scalar Pucks**
    *   **Function:** Chakra alignment and subtle-energy therapy.
    *   **Output:** Bifilar pancake coils (designed to cancel standard magnetic fields and generate scalar waves) paired with specific piezoelectric or resonant crystals (e.g., quartz, amethyst) to modulate the electromagnetic output.

---

### 3. Network & Data Architecture
The system eschews standard real-time streaming in favor of a low-latency, highly stable mesh architecture (e.g., custom 2.4GHz RF, Thread, or modified BLE Mesh) to prevent jitter, which is detrimental to neurological entrainment.

#### 3.1. Data Protocol: `shd-ccp`
The **Spatial Harmonic Data - Continuous Control Protocol** (`shd-ccp`) is the backbone of the system. 
*   Rather than streaming raw audio/haptic waveforms, the Central Orchestrator sends lightweight `shd-ccp` packets containing **geometric instructions**: base frequency, modulation rate, phase offset, spatial coordinate, and target amplitude.
*   The local MCU on each puck mathematically generates the waveform locally based on these parameters.

#### 3.2. Synchronization: Local Geometric Timing & The `pi6` Handshake
Forcing real-time clock updates across a mesh network causes micro-stutters. To solve this, the system uses **Geometric Timing**:
*   **Local Oscillators:** Each puck uses a high-precision internal clock to generate its local waves based on the last received `shd-ccp` packet.
*   **The `pi6` Handshake:** Instead of constant clock-syncing, the Orchestrator sends a broadcast handshake at specific mathematical phase intervals (e.g., at exactly $\pi/6$ or 30-degree phase markers of the macro-entrainment frequency). 
*   **Phase Correction:** If a node detects its local wave is drifting from the Orchestrator's master geometry, it uses the `pi6` handshake to apply a microscopic, smoothed "slew" correction. This aligns the nodes perfectly without the user feeling any jarring skips or clicks in the sound/vibration.

---

### 4. Control Suite & Orchestrator
The centralized control panel serves as the brain of the operation, acting as the bridge between the practitioner/user and the mesh network.

*   **UI/UX Dashboard:** Visualizes the user's body mapping and the spatial location of each active puck. Allows manual setting of target brainwave states (Delta, Theta, Alpha, Beta, Gamma) and target chakra frequencies.
*   **Spatial Mapper:** Uses a drag-and-drop interface to assign spatial coordinates to physical pucks, allowing the system to calculate the complex ambisonic phasing required for full-body immersion.

---

### 5. AI Assistant & Biofeedback Integration
The ultimate goal of the system is closed-loop, personalized therapy. 

*   **Biofeedback Inputs:** The Orchestrator receives real-time data from external wearables or sensor-equipped pucks (e.g., HRV / Heart Rate Variability, EEG / Electroencephalogram, GSR / Galvanic Skin Response).
*   **AI Engine (The "Guide"):**
    *   Analyzes the user's real-time state against the desired target state.
    *   Dynamically authors new `shd-ccp` packets. If the user is resisting Theta entrainment, the AI might subtly adjust the EMDR pacing, alter the bifilar coil resonance, or introduce a 650nm light pulse to gently guide the nervous system.
    *   **Chakra Alignment:** Uses localized GSR and micro-voltage biofeedback to detect resistance in specific body zones, directing the AI to focus scalar/bifilar and ambisonic energy to those specific spatial coordinates until coherence is achieved.