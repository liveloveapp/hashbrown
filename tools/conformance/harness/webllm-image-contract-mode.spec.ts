import { requireWebLlmImageContracts } from './webllm-image-contract-mode';

for (const environment of [
  {},
  { LOCAL_LLM_E2E: '1' },
  { LOCAL_LLM_WEBLLM_IMAGES: '1' },
  { LOCAL_LLM_E2E: '1', LOCAL_LLM_WEBLLM_IMAGES: '1', CI: 'true' },
]) {
  test(`refuses image contracts outside explicit local-only opt-in ${JSON.stringify(environment)}`, () => {
    expect(() => requireWebLlmImageContracts(environment)).toThrow('local');
  });
}

test('allows explicitly enabled deterministic local image contracts', () => {
  const environment = { LOCAL_LLM_E2E: '1', LOCAL_LLM_WEBLLM_IMAGES: '1' };

  const result = requireWebLlmImageContracts(environment);

  expect(result).toBeUndefined();
});
