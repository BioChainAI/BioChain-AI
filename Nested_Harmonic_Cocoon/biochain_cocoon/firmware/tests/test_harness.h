// Tiny dependency-free test harness, so CI needs only a C++17 compiler.
#pragma once
#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace th {
struct Case { const char* name; std::function<void()> fn; };
inline std::vector<Case>& registry() { static std::vector<Case> r; return r; }
inline int& failures() { static int f = 0; return f; }
struct Reg { Reg(const char* n, std::function<void()> f) { registry().push_back({n, f}); } };
}  // namespace th

#define TEST(name) \
    static void name(); \
    static th::Reg reg_##name(#name, name); \
    static void name()

#define CHECK(cond) do { if (!(cond)) { \
    std::printf("    FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); ++th::failures(); } } while (0)

#define CHECK_NEAR(a, b, tol) do { double _a = (a), _b = (b); if (std::fabs(_a - _b) > (tol)) { \
    std::printf("    FAIL %s:%d  %s=%.6f vs %s=%.6f (tol %.6f)\n", __FILE__, __LINE__, #a, _a, #b, _b, (double)(tol)); \
    ++th::failures(); } } while (0)
