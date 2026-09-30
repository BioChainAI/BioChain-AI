# Host unit tests for firmware/shared_core. Needs only a C++17 compiler.
#   make -C firmware/tests          # build + run
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Werror
CORE := ../shared_core
SRCS := test_main.cpp test_geometric_engine.cpp test_packet.cpp test_node_runtime.cpp \
        $(CORE)/geometric_engine/geometric_audio_engine.cpp \
        $(CORE)/protocol/shdccp_packet.cpp \
        $(CORE)/protocol/presets_generated.cpp \
        $(CORE)/network_stack/packet_router.cpp

run: cocoon_tests
	./cocoon_tests

cocoon_tests: $(SRCS) $(wildcard *.h) $(wildcard $(CORE)/*/*.h)
	$(CXX) $(CXXFLAGS) -o $@ $(SRCS) -lm

clean:
	rm -f cocoon_tests

.PHONY: run clean
