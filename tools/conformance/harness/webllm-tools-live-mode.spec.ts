import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireWebLlmToolsLive } from './webllm-tools-live-mode';

const enabled = {
  LOCAL_LLM_E2E: '1',
  LOCAL_LLM_WEBLLM_TOOLS_LIVE: '1',
  LOCAL_LLM_DOWNLOAD: '1',
  WEBLLM_MODULE_PATH: '/tmp/hashbrown-webllm-types/086/package/lib/index.js',
  WEBLLM_MODEL: 'Phi-3.5-vision-instruct-q4f16_1-MLC',
};
for (const key of Object.keys(enabled)) {
  test(`tools live refuses missing ${key}`, () => {
    const environment = { ...enabled, [key]: '' };

    expect(() => requireWebLlmToolsLive(environment)).toThrow();
  });
}
for (const environment of [
  { CI: 'true' },
  { CI: 'false' },
  { WEBLLM_MODULE_PATH: 'relative.js' },
]) {
  test(`tools live refuses implicit selection ${JSON.stringify(environment)}`, () => {
    expect(() =>
      requireWebLlmToolsLive({ ...enabled, ...environment }),
    ).toThrow();
  });
}
test('tools live reuses the isolated profile and explicit application runtime/model', () => {
  const result = requireWebLlmToolsLive({
    ...enabled,
    LOCAL_LLM_PROFILE: '/personal',
  });

  expect(result).toEqual({
    model: enabled.WEBLLM_MODEL,
    modulePath: enabled.WEBLLM_MODULE_PATH,
    profile: join(tmpdir(), 'hashbrown-webllm-vision-profile'),
  });
});

test('tools live retains future explicit application selections without importing a runtime', () => {
  const result = requireWebLlmToolsLive({
    ...enabled,
    WEBLLM_MODULE_PATH: '/application/webllm.js',
    WEBLLM_MODEL: 'application-model',
  });

  expect(result.modulePath).toBe('/application/webllm.js');
  expect(result.model).toBe('application-model');
});
