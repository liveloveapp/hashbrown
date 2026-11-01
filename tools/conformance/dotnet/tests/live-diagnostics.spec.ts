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
  expect(Object.keys(reader).sort()).toEqual([
    'failed',
    'identityVerified',
    'stderr',
    'stdout',
    'url',
  ]);
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

test('diagnostics persist only manifest project group and fixed outcome metadata', () => {
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });

  diagnostics.record({
    project: 'angular-azure-cli',
    group: 'browser-tool',
    outcome: 'passed',
  });
  diagnostics.record({
    project: 'secret-project',
    group: 'secret-group',
    outcome: 'secret-outcome',
  });

  expect(lines.map((line) => JSON.parse(line))).toEqual([
    { project: 'angular-azure-cli', group: 'browser-tool', outcome: 'passed' },
    {},
  ]);
});

test('diagnostics preserve numeric native cap and dispatch evidence while dropping boolean and body material', () => {
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });

  diagnostics.record({
    httpCalls: 2,
    maxOutputTokens: 384,
    serverEffects: 1,
    effects: 1,
    body: 'CANARY',
    store: false,
  });

  expect(JSON.parse(lines[0])).toEqual({
    httpCalls: 2,
    maxOutputTokens: 384,
    serverEffects: 1,
    effects: 1,
    store: false,
  });
});

test('diagnostics identify only the three fixed native preflights', () => {
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });

  diagnostics.record({ preflight: 'azure-cli-chat', api: 'chat-completions' });
  diagnostics.record({ preflight: 'secret-audience' });

  expect(lines.map((line) => JSON.parse(line))).toEqual([
    { preflight: 'azure-cli-chat', api: 'chat-completions' },
    {},
  ]);
});

test('diagnostic drops and persistence failures make qualification unhealthy', () => {
  const failed = createLiveDiagnostics({
    write: () => {
      throw new Error('CANARY');
    },
  });

  expect(failed.record({ stage: 'completed' })).toBe(false);
  expect(() => failed.assertHealthy()).toThrow('LIVE_DIAGNOSTICS_FAILED');
  const dropped = createLiveDiagnostics({ write: () => undefined });
  for (let index = 0; index < 120_000; index++)
    dropped.record({ stage: 'completed' });
  expect(() => dropped.assertHealthy()).toThrow('LIVE_DIAGNOSTICS_FAILED');
});

test('native proof metadata is retained while fixture database secrets are excluded', () => {
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });

  diagnostics.record({
    nativeCoEmission: true,
    nativeExactHistory: true,
    nativeEffects: 1,
    DOTNET_TEST_POSTGRES: 'postgres-secret-sentinel',
    InterruptConnectionString: 'connection-secret-sentinel',
    InterruptSchema: 'schema-secret-sentinel',
  });

  expect(JSON.parse(lines[0])).toEqual({
    nativeCoEmission: true,
    nativeExactHistory: true,
    nativeEffects: 1,
  });
  expect(lines[0]).not.toContain('sentinel');
});

test('sanitized native approval proof remains independently parseable while all native identity canaries disappear', async () => {
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const { parseLiveNativeApprovalProof } =
    await import('../harness/live-native-approval');
  const { stats, proof } = nativeApprovalUnitEvidence();
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });

  diagnostics.record({
    ...stats,
    project: 'react-openai-key',
    group: 'native-approval',
    rawRequestId: 'NATIVE_PRIVATE_CANARY',
    rawCallId: 'NATIVE_PRIVATE_CANARY',
    batchId: 'NATIVE_PRIVATE_CANARY',
    descriptor: { secret: 'NATIVE_PRIVATE_CANARY' },
    InterruptConnectionString: 'NATIVE_PRIVATE_CANARY',
    ApiKey: 'NATIVE_PRIVATE_CANARY',
  });

  const retained = JSON.parse(lines[0]);
  expect(parseLiveNativeApprovalProof(retained)).toEqual(proof);
  expect(retained).toMatchObject({
    project: 'react-openai-key',
    group: 'native-approval',
    usageCompleteCalls: 3,
    usageIncompleteCalls: 0,
  });
  expect(lines.join('')).not.toContain('NATIVE_PRIVATE_CANARY');
  diagnostics.record({ ...proof, nativeApprovalCompletions: 2 });
  expect(() => parseLiveNativeApprovalProof(JSON.parse(lines[1]))).toThrow();
  expect(() => diagnostics.assertHealthy()).not.toThrow();
});

test('package identity is incremental, bounded and required before readiness', () => {
  const expected = {
    identity: 'Hashbrown.AspNetCore, Version=0.1.0.0',
    location: '/tmp/released/Hashbrown.AspNetCore.dll',
    sha256: 'a'.repeat(64),
  };
  const reader = createLiveOutputReader(expected);
  const line = `HASHBROWN_PACKAGE_IDENTITY:${JSON.stringify(expected)}\n`;
  reader.stdout(Buffer.from('Now listening on: http://127.0.0.1:4219\n'));

  expect(reader.url()).toBeUndefined();
  for (const byte of Buffer.from(line)) reader.stdout(Uint8Array.of(byte));

  expect(reader.url()).toBe('http://127.0.0.1:4219');
  reader.stdout(Buffer.from(line));
  expect(reader.url()).toBeUndefined();
  expect(reader.failed()).toBe(true);
});

test('wrong or oversized package identity fails closed without exposing raw child output', () => {
  const expected = {
    identity: 'released',
    location: '/tmp/assembly.dll',
    sha256: 'b'.repeat(64),
  };

  for (const line of [
    'HASHBROWN_PACKAGE_IDENTITY:{broken-secret-canary}\n',
    `HASHBROWN_PACKAGE_IDENTITY:${JSON.stringify({ ...expected, sha256: 'c'.repeat(64) })}\n`,
    `HASHBROWN_PACKAGE_IDENTITY:${'x'.repeat(9000)}\n`,
  ]) {
    const reader = createLiveOutputReader(expected);
    reader.stdout(
      Buffer.from(line + 'Now listening on: http://127.0.0.1:4219\n'),
    );

    expect(reader.url()).toBeUndefined();
    expect(reader.failed()).toBe(true);
    expect(JSON.stringify(reader)).not.toContain('secret-canary');
  }
});
