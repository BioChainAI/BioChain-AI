# Biochain: Harmonic Cocoon
## Repository Folder Architecture (Including R&D & Deployment)

This folder structure separates stable, production-ready components from rapid hardware prototyping and system deployment, ensuring a stable monorepo for the entire ecosystem.

```text
biochain_cocoon/
│
├── firmware/                        # C/C++ code for the ESP32/Teensy microcontrollers
│   ├── shared_core/                 # Stable libraries (geometric_engine, network_stack)
│   ├── nodes/                       # Production-ready application code for each puck type
│   │   ├── biopuck_audio/           
│   │   ├── photonic_light/          
│   │   ├── haptic_emdr/             
│   │   └── scalar_coil/             
│   │
│   ├── testbeds/                    # NEW: Isolated R&D firmware for testing specific hardware
│   │   ├── i2s_dac_sandbox/         # Proving out a new audio chip before merging to Biopuck
│   │   ├── bifilar_resonance_test/  # Tuning PWM frequencies for the pancake coil
│   │   └── mesh_latency_benchmarks/ # Stress-testing ESP-NOW packet drops
│   │
│   └── tests/                       # Automated unit tests for core math
│
├── hardware/                        # Physical design and engineering
│   ├── prototypes/                  # NEW: R&D hardware iterations and test jigs
│   │   ├── biopuck_breadboard/      # Fritzing diagrams/wiring for the dev-kit stage
│   │   ├── bifilar_spooler_jig/     # 3D files for the tool used to wind the copper coils
│   │   └── enclosure_test_prints/   # Rough STL files for fit-testing components
│   │
│   ├── production/                  # NEW: Final, deployment-ready hardware files
│   │   ├── biopuck_rev_1.0/         # Final KiCad PCB files, Gerber files, and BOM (Bill of Materials)
│   │   ├── scalar_coil_rev_1.0/     # Production-ready routing and exact specs
│   │   └── molded_enclosures/       # STEP files prepped for injection molding or SLA printing
│   │
│   └── datasheets/                  # Manufacturer PDFs for your DACs, ESP32s, and motor drivers
│
├── orchestrator/                    # The Central Control Panel & AI Engine
│   ├── backend/                     
│   ├── ai_core/                     
│   └── frontend/                    
│
├── deploy/                          # NEW: Deployment and Infrastructure Pipelines
│   ├── firmware_ota/                # Scripts to push Over-The-Air (OTA) updates to deployed pucks
│   ├── orchestrator_docker/         # Dockerfiles to package the AI/Backend for local servers/Raspberry Pi
│   ├── database_migrations/         # Scripts for updating user profile schemas
│   └── ci_cd/                       # GitHub Actions/Gitlab pipelines for automated testing
│
├── protocols/                       # Data structures (shd-ccp, pi6 handshake logic)
│   ├── schemas/                     
│   └── docs/                        
│
├── standalone_presets/              # Pre-calculated JSON sequences for offline use
│
└── docs/                            # High-level system documentation
    ├── architecture/                
    ├── hardware_assembly/           # Step-by-step guides on soldering and assembling the nodes
    └── api_reference/               
```

### Key Additions for R&D vs. Deployment:

1.  **`firmware/testbeds/`**: This is your "sandbox." When you get a new bifilar coil and want to test how it reacts to a specific crystal, you write the code here. It doesn't touch the stable `nodes/` code until the hardware behavior is proven and refined.
2.  **`hardware/prototypes/` vs. `hardware/production/`**: A breadboard diagram with loose wires (`prototypes`) is very different from a printed circuit board file sent to a manufacturer (`production`). This separation keeps your messy experiments away from your final product blueprints.
3.  **`deploy/`**: This is how you push your system to the real world. Instead of manually flashing 10 pucks via USB, you use `firmware_ota/` scripts to push updates over Wi-Fi. The `orchestrator_docker/` ensures your control panel runs exactly the same whether it's installed on a high-end PC or a dedicated Raspberry Pi acting as the hub.