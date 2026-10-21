import * as http from 'node:http';
import * as https from 'node:https';
import { dirname, join } from 'node:path';
import {
  collectSecrets,
  isRecording,
  RECORDED_FIXTURES_ROOT,
  type RecordedAimock,
  recordedTestSlug,
  startRecordedAimock,
} from './recording';

interface AimockHelpers {
  slugifyTestId(testId: string): string;
}

function loadAimockHelpers(): AimockHelpers {
  // aimock does not export slugifyTestId from its entry; read the built helper
  // directly so this test catches drift between our copy and aimock's.
  const entry = require.resolve('@copilotkit/aimock');
  return require(join(dirname(entry), 'helpers.cjs')) as AimockHelpers;
}

test('isRecording is true only for AIMOCK_RECORD=1', () => {
  const envs = [
    { AIMOCK_RECORD: '1' },
    { AIMOCK_RECORD: '0' },
    { AIMOCK_RECORD: 'true' },
    { AIMOCK_RECORD: '' },
    {},
  ];

  const results = envs.map((env) => isRecording(env));

  expect(results).toEqual([true, false, false, false, false]);
});

test('recordedTestSlug matches aimock slug for the same id', () => {
  const { slugifyTestId } = loadAimockHelpers();
  const ids = [
    'openai streams plain text',
    'packages/openai/src/integration.spec.ts › OpenAI › streams text',
    'Anthropic > thinking: emits reasoning (gpt-5-mini)',
    '  ---weird___id---  ',
  ];

  const slugs = ids.map((id) => recordedTestSlug(id));

  expect(slugs).toEqual(ids.map((id) => slugifyTestId(id)));
});

test('collectSecrets returns every non-empty credential value', () => {
  const env = {
    OPENAI_API_KEY: 'sk-openai',
    ANTHROPIC_API_KEY: 'sk-ant',
    CLIENT_SECRET: 'client-secret',
    CLIENT_SECRET_VALUE: 'client-secret-value',
    GITHUB_TOKEN: 'ghp-token',
    AWS_ACCESS_KEY_ID: 'AKIAFAKE',
    AWS_REGION: 'us-east-1',
    AZURE_OPENAI_ENDPOINT: 'https://fake.openai.azure.com',
    EMPTY_API_KEY: '',
    HOME: '/Users/someone',
    OLLAMA_MODEL: 'llama3',
    AIMOCK_RECORD: '1',
  };

  const secrets = collectSecrets(env);

  expect([...secrets].sort()).toEqual(
    [
      'sk-openai',
      'sk-ant',
      'client-secret',
      'client-secret-value',
      'ghp-token',
      'AKIAFAKE',
      'us-east-1',
      'https://fake.openai.azure.com',
    ].sort(),
  );
});

test('strict replay fails a request with no fixture and names the test', async () => {
  const testName = expect.getState().currentTestName ?? '';
  const slug = recordedTestSlug(testName);
  const previousRecord = process.env['AIMOCK_RECORD'];
  delete process.env['AIMOCK_RECORD'];
  const httpRequest = jest.spyOn(http, 'request');
  const httpsRequest = jest.spyOn(https, 'request');
  let recorded: RecordedAimock | null = null;
  let status = 0;
  let body = '';
  let outboundCalls = 0;

  try {
    recorded = await startRecordedAimock({
      testName,
      provider: 'openai',
      upstream: 'https://api.openai.com',
      secrets: [],
    });
    const response = await fetch(
      `${recorded.aimock.openAiBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${recorded.apiKey(undefined)}`,
          ...recorded.headers,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: 'never recorded' }],
        }),
      },
    );
    status = response.status;
    body = await response.text();
    outboundCalls =
      httpRequest.mock.calls.length + httpsRequest.mock.calls.length;
  } finally {
    httpRequest.mockRestore();
    httpsRequest.mockRestore();
    if (previousRecord === undefined) {
      delete process.env['AIMOCK_RECORD'];
    } else {
      process.env['AIMOCK_RECORD'] = previousRecord;
    }
    await recorded?.aimock.stop();
  }

  expect(recorded?.recording).toBe(false);
  expect(recorded?.headers).toEqual({ 'X-Test-Id': slug });
  expect(status).toBe(503);
  expect(body).toContain(slug);
  expect(body).toContain(join(RECORDED_FIXTURES_ROOT, slug, 'openai.json'));
  expect(outboundCalls).toBe(0);
});
