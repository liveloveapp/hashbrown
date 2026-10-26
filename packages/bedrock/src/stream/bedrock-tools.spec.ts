import {
  bedrockRunningStep,
  matchBedrockProviderResult,
  readBedrockProviderCall,
  readBedrockProviderResult,
} from './bedrock-tools';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a normalized fixture');
  return value;
}

const use = (
  name = 'nova_grounding',
  id = 'call',
  input: unknown = { query: 'weather' },
) => ({ toolUse: { toolUseId: id, name, type: 'server_tool_use', input } });
const result = (content: unknown[], extra = {}) => ({
  toolResult: { toolUseId: 'call', content, ...extra },
});

test('ownership comes from the native discriminator rather than the name', () => {
  const ordinary = {
    toolUse: { toolUseId: 'app', name: 'nova_grounding', input: {} },
  };

  const call = readBedrockProviderCall(use(), 10);

  expect(readBedrockProviderCall(ordinary)).toBeUndefined();
  expect(
    readBedrockProviderCall({
      toolUse: { ...ordinary.toolUse, type: 'future' },
    }),
  ).toBeUndefined();
  expect(call).toMatchObject({
    id: 'call',
    builtin: 'web_search',
    input: { query: 'weather' },
  });
  expect(bedrockRunningStep(required(call))).toEqual({
    v: 1,
    kind: 'provider',
    provider: 'bedrock',
    builtin: 'web_search',
    status: 'running',
    icon: 'search',
    startedAt: 10,
    queries: ['weather'],
    label: "Searching the web for 'weather'",
  });
});

test('unknown server tools remain provider calls without invented builtins or query labels', () => {
  const input = {
    search: 'not a query',
    queries: ['yes', 4],
    other: { nested: true },
  };

  const call = required(
    readBedrockProviderCall(use('future_tool', 'future', input)),
  );
  const step = bedrockRunningStep(call);

  expect(call.builtin).toBeUndefined();
  expect(step).toMatchObject({
    kind: 'provider',
    provider: 'bedrock',
    label: 'Using future_tool',
    status: 'running',
  });
  expect(step.queries).toBeUndefined();
  expect(call.input).toEqual(input);
  expect(call.input).not.toBe(input);
});

test('JSONDocument input stays scalar or array and validated query arrays supply labels', () => {
  const scalar = required(
    readBedrockProviderCall(use('nova_grounding', 's', '{"query":"opaque"}')),
  );
  const array = required(
    readBedrockProviderCall(use('nova_grounding', 'a', ['opaque'])),
  );
  const queries = required(
    readBedrockProviderCall(
      use('nova_grounding', 'q', { queries: ['one', 'two'] }),
    ),
  );

  const steps = [scalar, array, queries].map(bedrockRunningStep);

  expect(scalar.input).toBe('{"query":"opaque"}');
  expect(array.input).toEqual(['opaque']);
  expect(steps[0].queries).toBeUndefined();
  expect(steps[2].queries).toEqual(['one', 'two']);
});

test('results require a unique native identity and compatible family', () => {
  const call = required(readBedrockProviderCall(use()));

  const matched = matchBedrockProviderResult(result([{ text: 'ok' }]), [call]);

  expect(matched).toBe(call);
  expect(
    matchBedrockProviderResult(
      { toolResult: { toolUseId: 'missing', content: [] } },
      [call],
    ),
  ).toBeUndefined();
  expect(
    readBedrockProviderResult(call, {
      toolResult: { toolUseId: 'missing', content: [] },
    }),
  ).toBeUndefined();
  expect(() =>
    matchBedrockProviderResult(
      result([], { type: 'nova_code_interpreter_result' }),
      [call],
    ),
  ).toThrow(/type|family/i);
  expect(() => matchBedrockProviderResult(result([]), [call, call])).toThrow(
    /identity/i,
  );
});

test('ordered text and Document members remain native and produce owned successful results', () => {
  const call = required(readBedrockProviderCall(use(), 20));
  const block = result(
    [
      { text: 'a' },
      { json: { a: 1 } },
      { json: '{"not":"parsed"}' },
      { text: 'b' },
    ],
    {
      status: 'success',
      type: 'nova_grounding_result',
      opaque: { preserve: true },
    },
  );

  const settled = required(readBedrockProviderResult(call, block, 15));

  expect(settled.step).toMatchObject({
    status: 'completed',
    startedAt: 20,
    settledAt: 20,
  });
  expect(settled.content).toContain('a');
  expect(settled.content).toContain('b');
  expect(settled.nativeBlock).toEqual(block);
  expect(settled.nativeBlock).not.toBe(call.nativeBlock);
  expect(block.toolResult.content).toEqual([
    { text: 'a' },
    { json: { a: 1 } },
    { json: '{"not":"parsed"}' },
    { text: 'b' },
  ]);
});

test.each([
  { json: { stdout: '2', stderr: 'warning', exitCode: 0 } },
  { text: '{"stdout":"2","stderr":"warning","exitCode":0}' },
])(
  'normalizes interpreter schema without treating stderr as failure: %p',
  (member) => {
    const call = required(
      readBedrockProviderCall(use('nova_code_interpreter')),
    );

    const settled = required(
      readBedrockProviderResult(call, result([member]), 30),
    );

    expect(settled.step).toMatchObject({
      builtin: 'code_execution',
      status: 'completed',
      label: 'Ran code',
    });
    expect(settled.content).toContain('warning');
  },
);

test.each([
  { json: { isError: true, error: 'bad code', errorCode: 'BAD' } },
  { text: '{"exitCode":2,"stderr":"failed"}' },
])('explicit interpreter failures are readable: %p', (member) => {
  const call = required(readBedrockProviderCall(use('nova_code_interpreter')));

  const settled = required(
    readBedrockProviderResult(call, result([member]), 30),
  );

  expect(settled.step.status).toBe('failed');
  expect(settled.step.error?.message).toMatch(/bad code|failed/);
  expect(settled.content).toMatch(/bad code|failed/);
});

test('native error status fails with a readable fallback and code', () => {
  const call = required(readBedrockProviderCall(use()));

  const settled = required(
    readBedrockProviderResult(
      call,
      result([{ json: { error: { message: 'denied', code: 'DENIED' } } }], {
        status: 'error',
      }),
    ),
  );

  expect(settled.step.error).toEqual({ message: 'denied', code: 'DENIED' });
  expect(settled.step.status).toBe('failed');
});

test('only explicit structured URLs from matched results become call scoped sources', () => {
  const call = required(readBedrockProviderCall(use()));
  const block = result([
    { text: 'https://ordinary.example' },
    {
      json: {
        hiddenGrounding: { url: 'https://hidden.example' },
        sources: [
          { url: 'https://one.example', title: 'One' },
          { url: 'javascript:bad' },
          { url: 'https://one.example' },
        ],
      },
    },
  ]);

  const first = required(readBedrockProviderResult(call, block));
  const second = required(readBedrockProviderResult(call, block));

  expect(first.step.sources).toEqual([
    {
      id: 'call:source:0',
      kind: 'url',
      title: 'One',
      href: 'https://one.example',
    },
  ]);
  expect(second.step.sources).toEqual(first.step.sources);
  expect(second.step.sources).not.toBe(first.step.sources);
});

test('JSONDocument strings stay opaque even for interpreter results', () => {
  const call = required(readBedrockProviderCall(use('nova_code_interpreter')));

  const settled = required(
    readBedrockProviderResult(
      call,
      result([{ json: '{"isError":true,"exitCode":2}' }]),
    ),
  );

  expect(settled.step.status).toBe('completed');
  expect(settled.nativeBlock).toEqual(
    result([{ json: '{"isError":true,"exitCode":2}' }]),
  );
});

test('known interpreter exit codes supply machine readable failure codes', () => {
  const call = required(readBedrockProviderCall(use('nova_code_interpreter')));

  const settled = required(
    readBedrockProviderResult(
      call,
      result([{ json: { exitCode: 2, stderr: 'failed' } }]),
    ),
  );

  expect(settled.step.error).toEqual({ message: 'failed', code: '2' });
});

test('result interpretation never aliases mutable native inputs or call inputs', () => {
  const input = { query: 'weather', nested: { value: 1 } };
  const block = use('nova_grounding', 'call', input);
  const call = required(readBedrockProviderCall(block));
  const nativeResult = result([
    { json: { sources: [{ url: 'https://one.example', title: 'One' }] } },
  ]);

  const settled = required(readBedrockProviderResult(call, nativeResult));
  input.nested.value = 2;
  const json = nativeResult.toolResult.content[0] as {
    json: { sources: { title: string }[] };
  };
  json.json.sources[0].title = 'changed';

  expect(call.input).toEqual({ query: 'weather', nested: { value: 1 } });
  expect(call.nativeBlock.toolUse?.input).toEqual({
    query: 'weather',
    nested: { value: 1 },
  });
  expect(settled.nativeBlock.toolResult?.content).toEqual([
    { json: { sources: [{ url: 'https://one.example', title: 'One' }] } },
  ]);
  expect(settled.step.sources?.[0].title).toBe('One');
});

test('unknown native server families settle by matching ID and preserve unknown fields', () => {
  const call = required(readBedrockProviderCall(use('future_tool')));
  const block = result([{ text: 'future result' }], {
    type: 'future_tool_result',
    extension: { retain: ['all'] },
  });

  const settled = required(readBedrockProviderResult(call, block));

  expect(settled.step.builtin).toBeUndefined();
  expect(settled.step.label).toBe('Used future_tool');
  expect(settled.nativeBlock).toEqual(block);
});

test('contiguous text fragments form one interpreter document with AWS stdErr fields', () => {
  const call = required(readBedrockProviderCall(use('nova_code_interpreter')));
  const block = result(
    [
      { text: '{"isError":' },
      { text: 'true,"stdErr":"Readable","exitCode":2}' },
    ],
    { status: 'success' },
  );

  const settled = required(readBedrockProviderResult(call, block));

  expect(settled.step.error).toEqual({ message: 'Readable', code: '2' });
  expect(settled.content).toBe(
    '{"isError":true,"stdErr":"Readable","exitCode":2}',
  );
  expect(settled.nativeBlock).toEqual(block);
});

test('native getter properties reject before any accessor is invoked', () => {
  const getter = jest.fn(() => ({
    toolUseId: 'call',
    name: 'nova_grounding',
    type: 'server_tool_use',
    input: {},
  }));
  const invocation = Object.defineProperty({}, 'toolUse', {
    enumerable: true,
    get: getter,
  });
  const call = required(readBedrockProviderCall(use()));
  const output = Object.defineProperty({}, 'toolResult', {
    enumerable: true,
    get: getter,
  });

  expect(() => readBedrockProviderCall(invocation)).toThrow(/native/i);
  expect(() => matchBedrockProviderResult(output, [call])).toThrow(/native/i);

  expect(getter).not.toHaveBeenCalled();
});

test.each([
  { error: { message: 'bad' }, errorCode: 'BAD', expected: 'BAD' },
  {
    error: { message: 'bad', code: 'NESTED' },
    errorCode: 'BAD',
    expected: 'NESTED',
  },
])(
  'preserves supplied interpreter error codes with nested-code precedence: %p',
  ({ error, errorCode, expected }) => {
    const call = required(
      readBedrockProviderCall(use('nova_code_interpreter')),
    );

    const settled = required(
      readBedrockProviderResult(
        call,
        result([{ json: { isError: true, error, errorCode } }]),
      ),
    );

    expect(settled.step.error).toEqual({ message: 'bad', code: expected });
  },
);
