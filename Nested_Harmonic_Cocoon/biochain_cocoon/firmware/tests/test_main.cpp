#include "test_harness.h"

int main() {
    int prev = 0;
    for (auto& c : th::registry()) {
        c.fn();
        bool ok = th::failures() == prev;
        std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", c.name);
        prev = th::failures();
    }
    std::printf("\n%zu tests, %d failed checks\n", th::registry().size(), th::failures());
    return th::failures() ? 1 : 0;
}
