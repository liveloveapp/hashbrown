import { expect, jest, test } from '@jest/globals';

// Configuration inspection starts no browser or model. Opt-in behavior has its own tests.
jest.mock('./webllm-tools-live-mode', () => ({
  requireWebLlmToolsLive: jest.fn(),
}));

test('live tools honor shared smoke-host ports for warm-cache qualification', async () => {
  const originalEnvironment = process.env;
  process.env = {
    ...originalEnvironment,
    RUNTIME_SMOKE_ANGULAR_PORT: '4411',
    RUNTIME_SMOKE_REACT_PORT: '4412',
  };

  try {
    const { default: config } =
      await import('../local-webllm-tools-live.playwright.config');

    expect(config.projects?.map((project) => project.use?.baseURL)).toEqual([
      'http://127.0.0.1:4411',
      'http://127.0.0.1:4412',
    ]);
    expect(config.webServer).toEqual([
      expect.objectContaining({
        command: expect.stringContaining('--port=4411'),
        url: 'http://127.0.0.1:4411',
      }),
      expect.objectContaining({
        command: expect.stringContaining('--port=4412'),
        url: 'http://127.0.0.1:4412',
      }),
    ]);
  } finally {
    process.env = originalEnvironment;
  }
});
