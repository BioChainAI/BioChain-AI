# Dev-kit wiring (ESP32-S3-DevKitC-1)

Pin numbers are ESP32-S3 GPIOs. They match each node's `src/node_config.h`.
Change both together.

## Node A: Biopuck Audio (MAX98357A I2S amp, or PCM5102A line-out DAC)

| ESP32-S3 | MAX98357A | PCM5102A | note |
|---|---|---|---|
| GPIO12 | BCLK | BCK | |
| GPIO11 | LRC | LCK | |
| GPIO13 | DIN | DIN | |
| GPIO14 | SD | XSMT | LOW = mute; firmware holds it low until the first clean buffer |
| 5V | VIN | VIN | |
| GND | GND | GND, FMT, SCK | PCM5102A: FMT→GND (I2S), SCK→GND (internal PLL) |
| GPIO2 | | | status LED (330 Ω) |

MAX98357A GAIN pin floating = 9 dB. Tie it to GND through 100 kΩ for 15 dB only
if the speaker needs it; the firmware already caps amplitude at 0.8 FS.

```
 ESP32-S3            MAX98357A           speaker (4–8 Ω, 3 W)
 GPIO12 ───────────── BCLK
 GPIO11 ───────────── LRC
 GPIO13 ───────────── DIN
 GPIO14 ───────────── SD                 OUT+ ──── (+)
 5V ───────────────── VIN                OUT− ──── (−)
 GND ──────────────── GND
```

## Node B: Photonic (650 nm)

| ESP32-S3 | part | note |
|---|---|---|
| GPIO5 | PT4115 DIM | 19.5 kHz PWM; driver sets max current via Rs (0.33 Ω ≈ 300 mA) |
| GPIO4 | NTC divider | 10 k NTC (B3950) to GND, 10 k to 3V3, on the LED heatsink |
| 12 V | PT4115 VIN | from a USB-C PD trigger board (12 V profile) |

LED array: 3× 650 nm high-power LEDs in series, on an aluminium star with a heatsink.

## Node C: Haptic EMDR

| ESP32-S3 | DRV8833 | note |
|---|---|---|
| GPIO6 | AIN1 | left motor (AIN2 → GND) |
| GPIO7 | BIN1 | right motor (BIN2 → GND) |
| GPIO8 | nSLEEP | LOW = motors unpowered |
| 5V | VM | |

Motors: 10 mm coin ERM (3 V) with 1N4148 flyback not required (DRV8833 has internal diodes).

## Node D: Scalar coil

| ESP32-S3 | DRV8871 | note |
|---|---|---|
| GPIO9 | IN1 | LEDC ch0 |
| GPIO10 | IN2 | LEDC ch1, half-period hpoint offset |
| GPIO4 | NTC divider | taped to the coil former |
| GPIO6 | shunt amp out | testbed only: 0.1 Ω shunt + 20× amplifier |
| GPIO5 | search-coil pickup | testbed only: 50-turn pickup + 1 MΩ bias to 1.65 V |
| 12 V | VM | ILIM resistor 30 kΩ ≈ 2 A limit |

The coil connects across OUT1/OUT2 (series-connected bifilar, see
`production/scalar_coil_rev_1.0/coil_spec.md`).

## Common

* BOOT button (GPIO0): hold 3 s to toggle photosensitive consent (NVS).
* USB-C for power and flashing. Keep the audio ground star-connected at the amp.
