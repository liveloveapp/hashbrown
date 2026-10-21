import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { tmpdir } from 'node:os';
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
    OPENAI_API_KEY: 'sk-openai-fake-0001',
    ANTHROPIC_API_KEY: 'sk-ant-fake-00002',
    CLIENT_SECRET: 'client-secret-fake',
    CLIENT_SECRET_VALUE: 'client-secret-value-fake',
    GITHUB_TOKEN: 'ghp-token-fake-0003',
    AWS_ACCESS_KEY_ID: 'AKIAFAKEFAKEFAKE',
    AZURE_OPENAI_ENDPOINT: 'https://fake.openai.azure.com',
    EMPTY_API_KEY: '',
    HOME: '/Users/someone-with-long-home',
    AIMOCK_RECORD: '1',
  };

  const secrets = collectSecrets(env);

  expect([...secrets].sort()).toEqual(
    [
      'sk-openai-fake-0001',
      'sk-ant-fake-00002',
      'client-secret-fake',
      'client-secret-value-fake',
      'ghp-token-fake-0003',
      'AKIAFAKEFAKEFAKE',
      'https://fake.openai.azure.com',
    ].sort(),
  );
});

test('collectSecrets drops region, model and API version values', () => {
  const env = {
    AWS_REGION: 'ap-southeast-2-long',
    AWS_DEFAULT_REGION: 'ap-southeast-2-long',
    BEDROCK_REGION: 'ap-southeast-2-long',
    OLLAMA_MODEL: 'llama3.2-some-long-tag',
    BEDROCK_MODEL_ID: 'anthropic.claude-fake-model-v1',
    AZURE_API_VERSION: '2025-04-01-preview',
    OPENAI_API_KEY: 'sk-openai-fake-0001',
  };

  const secrets = collectSecrets(env);

  expect(secrets).toEqual(['sk-openai-fake-0001']);
});

test('collectSecrets drops values shorter than 12 characters', () => {
  const env = {
    SOME_KEY: '1',
    SHORT_TOKEN: 'abcdefghijk',
    AWS_PROFILE: 'default',
    LONG_ENOUGH_TOKEN: 'abcdefghijkl',
  };

  const secrets = collectSecrets(env);

  expect(secrets).toEqual(['abcdefghijkl']);
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

function runClearRecordings(root: string, args: string[]): string[] {
  const script = join(__dirname, 'clear-recordings.mjs');
  const output = execFileSync(
    process.execPath,
    [script, '--root', root, ...args],
    { encoding: 'utf8' },
  );
  return output.split('\n').filter(Boolean).sort();
}

function seedRecordings(root: string, files: string[]): void {
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '{}');
  }
}

test('clear-recordings removes only the given provider files', () => {
  const root = mkdtempSync(join(tmpdir(), 'recordings-'));
  seedRecordings(root, [
    'openai-a/openai.json',
    'openai-b/openai.json',
    'openai-b/anthropic.json',
    'anthropic-a/anthropic.json',
  ]);

  const removed = runClearRecordings(root, ['openai.json']);

  expect(removed).toEqual(['openai-a/openai.json', 'openai-b/openai.json']);
  expect(existsSync(join(root, 'openai-a'))).toBe(false);
  expect(existsSync(join(root, 'openai-b/anthropic.json'))).toBe(true);
  expect(existsSync(join(root, 'anthropic-a/anthropic.json'))).toBe(true);
});

test('clear-recordings keeps Azure and OpenAI recordings apart by slug prefix', () => {
  const root = mkdtempSync(join(tmpdir(), 'recordings-'));
  const files = ['openai-text/openai.json', 'azure-openai-text/openai.json'];
  seedRecordings(root, files);

  const openai = runClearRecordings(root, [
    'openai.json',
    '--exclude-slug-prefix',
    'azure-',
  ]);
  seedRecordings(root, files);
  const azure = runClearRecordings(root, [
    'openai.json',
    '--slug-prefix',
    'azure-',
  ]);

  expect(openai).toEqual(['openai-text/openai.json']);
  expect(azure).toEqual(['azure-openai-text/openai.json']);
});

test('clear-recordings does nothing when the recordings root is missing', () => {
  const root = join(tmpdir(), 'recordings-missing-root');

  const removed = runClearRecordings(root, ['openai.json']);

  expect(removed).toEqual([]);
});
