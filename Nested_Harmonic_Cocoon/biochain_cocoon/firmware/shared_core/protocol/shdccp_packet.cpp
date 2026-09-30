#include "shdccp_packet.h"
#include <cmath>
#include <cstring>

namespace cocoon {

namespace {
// Explicit little-endian (de)serialisation. Never memcpy the struct itself,
// because its padding and endianness are not part of the contract.
void putU16(uint8_t* b, uint16_t v) { b[0] = v & 0xFF; b[1] = v >> 8; }
void putU32(uint8_t* b, uint32_t v) { for (int i = 0; i < 4; ++i) b[i] = (v >> (8 * i)) & 0xFF; }
void putF32(uint8_t* b, float f) { uint32_t v; std::memcpy(&v, &f, 4); putU32(b, v); }
uint16_t getU16(const uint8_t* b) { return static_cast<uint16_t>(b[0] | (b[1] << 8)); }
uint32_t getU32(const uint8_t* b) {
    return static_cast<uint32_t>(b[0]) | (static_cast<uint32_t>(b[1]) << 8) |
           (static_cast<uint32_t>(b[2]) << 16) | (static_cast<uint32_t>(b[3]) << 24);
}
float getF32(const uint8_t* b) { uint32_t v = getU32(b); float f; std::memcpy(&f, &v, 4); return f; }
}  // namespace

uint16_t crc16Ccitt(const uint8_t* data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= static_cast<uint16_t>(data[i]) << 8;
        for (int b = 0; b < 8; ++b) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
    }
    return crc;
}

void encodePacket(const ShdCcpPacket& p, uint8_t out[kPacketSize]) {
    out[0] = 'H'; out[1] = 'C'; out[2] = kProtocolVersion;
    out[3] = static_cast<uint8_t>(p.cmd);
    putU16(out + 4, p.seq);
    putU16(out + 6, p.node);
    out[8] = p.modality;
    out[9] = p.mode;
    putU16(out + 10, p.flags);
    putF32(out + 12, p.fc);
    putF32(out + 16, p.fe);
    putF32(out + 20, p.amp);
    putF32(out + 24, p.pan);
    putF32(out + 28, p.phase);
    putU32(out + 32, p.rampMs);
    putF32(out + 36, p.x);
    putF32(out + 40, p.y);
    putF32(out + 44, p.z);
    putU16(out + 48, p.aux);
    putU16(out + 50, crc16Ccitt(out, 50));
}

DecodeResult decodePacket(const uint8_t* d, size_t len, ShdCcpPacket& p) {
    if (len < kPacketSize) return DecodeResult::TooShort;
    if (d[0] != 'H' || d[1] != 'C') return DecodeResult::BadMagic;
    if (d[2] != kProtocolVersion) return DecodeResult::BadVersion;
    if (crc16Ccitt(d, 50) != getU16(d + 50)) return DecodeResult::BadCrc;
    p.cmd = static_cast<Command>(d[3]);
    p.seq = getU16(d + 4);
    p.node = getU16(d + 6);
    p.modality = d[8];
    p.mode = d[9];
    p.flags = getU16(d + 10);
    p.fc = getF32(d + 12);
    p.fe = getF32(d + 16);
    p.amp = getF32(d + 20);
    p.pan = getF32(d + 24);
    p.phase = getF32(d + 28);
    p.rampMs = getU32(d + 32);
    p.x = getF32(d + 36);
    p.y = getF32(d + 40);
    p.z = getF32(d + 44);
    p.aux = getU16(d + 48);
    const float vals[] = {p.fc, p.fe, p.amp, p.pan, p.phase, p.x, p.y, p.z};
    for (float v : vals) if (!std::isfinite(v)) return DecodeResult::BadValue;
    if (p.cmd < Command::UpdateGeo || p.cmd > Command::Telemetry) return DecodeResult::BadValue;
    return DecodeResult::Ok;
}

const char* decodeResultName(DecodeResult r) {
    switch (r) {
    case DecodeResult::Ok: return "ok";
    case DecodeResult::TooShort: return "too_short";
    case DecodeResult::BadMagic: return "bad_magic";
    case DecodeResult::BadVersion: return "bad_version";
    case DecodeResult::BadCrc: return "bad_crc";
    case DecodeResult::BadValue: return "bad_value";
    }
    return "unknown";
}

}  // namespace cocoon
