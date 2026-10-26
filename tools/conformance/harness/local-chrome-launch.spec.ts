import { localChromeLaunch } from './local-chrome-launch';

test('normal native tests retain the browser default model', () => {
  const result = localChromeLaunch({ tools: false });

  expect(result.modelVersion).toBe('default');
  expect(result.launchOptions.args).toEqual(['--disable-features=']);
});

test('typed tool tests retain v4 and exact experimental interfaces', () => {
  const result = localChromeLaunch({ tools: true });

  expect(result.modelVersion).toBe('v4');
  expect(result.launchOptions.args).toEqual([
    '--disable-features=',
    '--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4',
  ]);
});

test('4B selection changes only the foundational model experiment', () => {
  const options = Object.freeze({ tools: true, modelVersion: 'v4_4b' });

  const result = localChromeLaunch(options);

  expect(result.modelVersion).toBe('v4_4b');
  expect(result.launchOptions.args?.[1]).toBe(
    '--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4_4b',
  );
  expect(options).toEqual({ tools: true, modelVersion: 'v4_4b' });
});

test('default model can be probed with tool interfaces without forcing v4', () => {
  const result = localChromeLaunch({ tools: true, modelVersion: 'default' });

  expect(result.launchOptions.args).toEqual([
    '--disable-features=',
    '--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend',
  ]);
});

test('a model override alone does not enable tool interfaces', () => {
  const result = localChromeLaunch({ tools: false, modelVersion: 'v4_4b' });

  expect(result.launchOptions.args?.[1]).toBe(
    '--enable-features=AIApiFoundationalModel:model_version/v4_4b',
  );
});

test('invalid or empty model selections fail instead of silently testing defaults', () => {
  for (const modelVersion of [
    '',
    'nano-4b',
    'v4_12b',
    'V4',
    'v4,OtherFeature',
  ]) {
    expect(() => localChromeLaunch({ tools: true, modelVersion })).toThrow(
      'LOCAL_LLM_CHROME_MODEL_VERSION must be default, v4, or v4_4b',
    );
  }
});

test('launch defaults restore component updates without sharing mutable arrays', () => {
  const first = localChromeLaunch({ tools: true });
  first.launchOptions.args?.push('--arbitrary-test-flag');

  const second = localChromeLaunch({ tools: true });

  expect(second.launchOptions.args).not.toContain('--arbitrary-test-flag');
  expect(second.launchOptions.ignoreDefaultArgs).toEqual([
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-field-trial-config',
  ]);
});
