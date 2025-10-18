/*
 * Stub implementations for missing WebRTC functions
 * These are minimal implementations for standalone VAD compilation
 */

#include <stdio.h>
#include <stdlib.h>

// Stub for rtc_FatalMessage - just print and exit
void rtc_FatalMessage(const char* file, int line, const char* message) {
    fprintf(stderr, "FATAL ERROR in %s:%d: %s\n", file, line, message);
    exit(1);
}
