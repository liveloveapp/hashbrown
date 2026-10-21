import '@testing-library/jest-dom/vitest';

// Keep specs that create real chat runtimes from sending development
// collection requests; growth specs mock the collector instead.
(
  window as unknown as { __HASHBROWN_TELEMETRY_DISABLED__?: boolean }
).__HASHBROWN_TELEMETRY_DISABLED__ = true;
