import { requireWebLlmToolContracts } from './webllm-tool-contract-mode';

for (const environment of [
  {},
  { LOCAL_LLM_E2E: '1' },
  { LOCAL_LLM_WEBLLM_TOOLS: '1' },
  { LOCAL_LLM_E2E: '1', LOCAL_LLM_WEBLLM_TOOLS: '1', CI: 'true' },
  { LOCAL_LLM_E2E: '1', LOCAL_LLM_WEBLLM_TOOLS: '1', CI: 'false' },
]) {
  test(`refuses tool contracts outside explicit local opt-in ${JSON.stringify(environment)}`, () => {
    const run = () => requireWebLlmToolContracts(environment);

    expect(run).toThrow('local');
  });
}

test('allows explicitly enabled model-free tool contracts', () => {
  const environment = { LOCAL_LLM_E2E: '1', LOCAL_LLM_WEBLLM_TOOLS: '1' };

  const result = requireWebLlmToolContracts(environment);

  expect(result).toBeUndefined();
});
