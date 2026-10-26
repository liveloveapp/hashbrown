import { requireWebLlmVisionSmoke } from './webllm-vision-mode';

const enabled = {
  LOCAL_LLM_E2E: '1',
  LOCAL_LLM_WEBLLM_VISION: '1',
  LOCAL_LLM_DOWNLOAD: '1',
  WEBLLM_MODULE_PATH: '/tmp/application-webllm/lib/index.js',
  WEBLLM_MODEL: 'application-selected-vision-model',
};
for (const key of Object.keys(enabled)) {
  test(`refuses vision smoke without explicit ${key}`, () => {
    const environment = { ...enabled, [key]: '' };

    expect(() => requireWebLlmVisionSmoke(environment)).toThrow();
  });
}

test('refuses real vision smoke in CI despite explicit local flags', () => {
  expect(() => requireWebLlmVisionSmoke({ ...enabled, CI: 'true' })).toThrow(
    'CI',
  );
});

test('requires an absolute application bundle path without selecting a model default', () => {
  expect(() =>
    requireWebLlmVisionSmoke({ ...enabled, WEBLLM_MODULE_PATH: 'relative.js' }),
  ).toThrow('absolute');
});

test('retains explicit application model selection and an isolated fixed persistent profile', () => {
  const result = requireWebLlmVisionSmoke({
    ...enabled,
    LOCAL_LLM_PROFILE: '/personal/profile',
  });

  expect(result.model).toBe(enabled.WEBLLM_MODEL);
  expect(result.modulePath).toBe(enabled.WEBLLM_MODULE_PATH);
  expect(result.profile).toContain('hashbrown-webllm-vision-profile');
  expect(result.profile).not.toContain('personal');
});
