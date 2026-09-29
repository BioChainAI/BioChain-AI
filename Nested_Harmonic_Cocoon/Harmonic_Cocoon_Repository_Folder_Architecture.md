Biochain: Harmonic Cocoon

Repository Folder Architecture

This folder structure is designed for a monorepo approach, keeping all components of the Harmonic Cocoon ecosystem (firmware, software, networking, and hardware designs) unified and easily accessible.

biochain_cocoon/
│
├── firmware/                        # C/C++ code for the ESP32/Teensy microcontrollers
│   ├── shared_core/                 # Libraries shared across ALL puck types
│   │   ├── geometric_engine/        # The math DSP logic (sine generation, isochronic pulsing)
│   │   ├── network_stack/           # Mesh networking, UDP/ESP-NOW setup
│   │   │   ├── shd_ccp_parser/      # Logic to decode/encode shd-ccp packets
│   │   │   └── pi6_sync/            # Phase slewing and handshake timing logic
│   │   └── utils/                   # Debugging, logging, hardware timers
│   │
│   ├── nodes/                       # Specific application code for each puck type
│   │   ├── biopuck_audio/           # Standalone & networked I2S audio generation
│   │   ├── photonic_light/          # PWM control for 650nm light emitters
│   │   ├── haptic_emdr/             # Bilateral vibration motor control
│   │   └── scalar_coil/             # Bifilar pancake coil & crystal resonance drivers
│   │
│   └── tests/                       # Unit tests for geometric math and sync logic
│
├── orchestrator/                    # The Central Control Panel & AI Engine (Python/Node.js/React)
│   ├── backend/                     # Server bridging the local network and the mesh pucks
│   │   ├── mesh_gateway/            # Handles broadcasting shd-ccp to the mesh
│   │   ├── sensor_ingest/           # API endpoints for receiving external HRV/EEG data
│   │   └── database/                # Stores user profiles, session histories, custom presets
│   │
│   ├── ai_core/                     # The Biofeedback "Guide" 
│   │   ├── state_analyzer/          # Real-time evaluation of bio-data vs target state
│   │   ├── entrainment_model/       # Algorithms for ramping frequencies (e.g., Alpha to Theta)
│   │   └── chakra_mapper/           # Logic translating GSR data to spatial scalar adjustments
│   │
│   └── frontend/                    # User Interface (React/Vue/Svelte)
│       ├── ui_components/           # Buttons, sliders, data graphs
│       ├── spatial_mapper/          # The 3D drag-and-drop interface for physical puck locations
│       └── views/                   # Dashboard, Practitioner Suite, Standalone User View
│
├── protocols/                       # Agnostic definitions of your custom data structures
│   ├── schemas/                     # JSON/Protobuf schemas for `shd-ccp` packets
│   └── docs/                        # Specifications detailing the `pi6` phase angles
│
├── hardware/                        # Physical design files
│   ├── schematics/                  # KiCad/Eagle files for custom PCB boards
│   ├── enclosures/                  # 3D print files (STL/STEP) for the puck casings
│   └── wiring_diagrams/             # Pinouts for DACs, LEDs, Motors, and Coils
│
├── standalone_presets/              # Pre-calculated geometric sequences for offline use
│   ├── sleep_theta.json             # e.g., Parameters for a deep sleep protocol
│   ├── focus_gamma.json             
│   └── chakra_balance.json
│
└── docs/                            # High-level system documentation
    ├── architecture/                # System architectures (like our previous documents)
    ├── api_reference/               # How the Orchestrator API works
    └── user_manuals/                # Setup guides for the mesh network


Key Organizational Benefits:

firmware/shared_core/: By keeping the geometric_engine and pi6_sync separate from the specific nodes, you only have to write the math and networking logic once. An Audio Biopuck and a Haptic EMDR Puck will pull from the exact same phase-sync library.

orchestrator/ai_core/: Isolates the biofeedback intelligence from the UI and the mesh network. This allows you to upgrade the AI model without breaking the communication to the pucks.

protocols/: Having a dedicated folder just for the rules of shd-ccp ensures that whether you are writing C++ for the puck or Python for the AI, both are referencing the exact same data structure.
