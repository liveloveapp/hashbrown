import {
  createLiveDiagnostics,
  createLiveOutputReader,
  safeLiveError,
} from '../harness/live-diagnostics';

test('projects allowlisted metadata before every persistence sink and discards arbitrary error values', () => {
  const writes: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (value) => writes.push(value),
  });
  const canary = 'secret-canary';

  diagnostics.record({
    provider: 'azure',
    api: 'responses',
    auth: 'azure-cli',
    model: 'gpt-4.1-mini',
    path: '/openai/v1/responses',
    status: 200,
    durationMs: 10,
    inputTokens: 12,
    outputTokens: 3,
    calls: 1,
    error: new Error(canary),
    stdout: canary,
    authorization: canary,
    request: { ApiKey: canary },
  });
  diagnostics.record({
    provider: canary,
    model: canary,
    path: `/secret/${canary}`,
    status: canary,
    error: { message: 'Incorrect API key: sec***ary' },
  });

  expect(writes).toHaveLength(2);
  expect(writes.join('')).not.toMatch(
    /canary|sec\*\*\*ary|authorization|stdout|error|request/,
  );
  expect(JSON.parse(writes[0])).toEqual({
    provider: 'azure',
    api: 'responses',
    auth: 'azure-cli',
    model: 'gpt-4.1-mini',
    path: '/openai/v1/responses',
    status: 200,
    durationMs: 10,
    inputTokens: 12,
    outputTokens: 3,
    calls: 1,
  });
  expect(JSON.parse(writes[1])).toEqual({});
});

test('bounds the aggregate diagnostic persistence at two MiB including newline bytes', () => {
  let bytes = 0;
  const diagnostics = createLiveDiagnostics({
    write: (value) => {
      bytes += Buffer.byteLength(value);
    },
  });

  for (let index = 0; index < 100_000; index++)
    diagnostics.record({ status: 200, durationMs: index, calls: index });

  expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(diagnostics.snapshot().bytes).toBe(bytes);
  expect(diagnostics.snapshot().dropped).toBeGreaterThan(0);
});

test('discards split stdout and stderr, exposing only a validated in-memory loopback listening URL', () => {
  const reader = createLiveOutputReader();

  reader.stdout(Buffer.from('secret-can'));
  reader.stderr(Buffer.from('ary Incorrect API key: sec***ary\n'));
  reader.stdout(Buffer.from('Now listening on: http://127.0.0.1:'));
  reader.stdout(Buffer.from('45231\nsecret-canary\n'));

  expect(reader.url()).toBe('http://127.0.0.1:45231');
  expect(JSON.stringify(reader)).not.toMatch(/canary|sec\*\*\*ary/);
  expect(Object.keys(reader).sort()).toEqual(['stderr', 'stdout', 'url']);
});

test('never returns non-loopback addresses or credential-bearing listening URLs', () => {
  for (const value of [
    'https://example.com',
    'http://secret@127.0.0.1:1234',
    'http://127.0.0.1:1234?key=canary',
    'http://127.0.0.1:99999',
  ]) {
    const reader = createLiveOutputReader();

    reader.stdout(Buffer.from(`Now listening on: ${value}\n`));

    expect(reader.url()).toBeUndefined();
  }
});

test('creates fixed-code safe errors without retaining raw causes or stack values', () => {
  const raw = new Error('Incorrect API key: sec***ary secret-canary');

  const error = safeLiveError('LIVE_CHILD_FAILED', raw);

  expect(error.message).toBe('LIVE_CHILD_FAILED');
  expect(error.cause).toBeUndefined();
  expect(JSON.stringify(error)).not.toMatch(/canary|sec\*\*\*ary/);
  expect(error.stack).not.toMatch(/canary|sec\*\*\*ary/);
  expect(() => safeLiveError('secret-canary', raw)).toThrow(
    'LIVE_UNKNOWN_FAILURE',
  );
});

test('retains only method and authentication presence from native audit evidence', () => {
  const writes: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => writes.push(line),
  });

  diagnostics.record({
    method: 'POST',
    authentication: 'bearer',
    path: '/openai/v1/responses',
    authorization: 'Bearer secret-canary',
  });
  diagnostics.record({
    method: 'secret-canary',
    authentication: 'Bearer sec***ary',
    path: '/unknown/secret-canary',
  });

  expect(JSON.parse(writes[0])).toEqual({
    method: 'POST',
    authentication: 'bearer',
    path: '/openai/v1/responses',
  });
  expect(JSON.parse(writes[1])).toEqual({});
});
