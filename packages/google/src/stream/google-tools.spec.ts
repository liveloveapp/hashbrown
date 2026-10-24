import { runInNewContext } from 'node:vm';
import {
  googleRunningStep,
  matchGoogleProviderResult,
  readGoogleProviderCall,
  readGoogleProviderResult,
} from './google-tools';

function call(
  part: unknown = {
    toolCall: {
      id: 'search',
      toolType: 'GOOGLE_SEARCH_WEB',
      args: { queries: ['weather', 'airports'] },
    },
  },
) {
  const result = readGoogleProviderCall(part, 'generated', 100);
  if (!result) throw new Error('Expected a supported native call');
  return result;
}

test('recognizes native provider calls independently from app function names', () => {
  const native = call();
  const app = { functionCall: { id: 'app', name: 'google_search', args: {} } };

  const running = googleRunningStep(native);

  expect(readGoogleProviderCall(app, 'generated', 100)).toBeUndefined();
  expect(running).toMatchObject({
    v: 1,
    kind: 'provider',
    provider: 'google',
    builtin: 'web_search',
    status: 'running',
    queries: ['weather', 'airports'],
    startedAt: 100,
    label: "Searching the web for 'weather'",
  });
});

test('keeps native invocation values owned and preserves code IDs and signatures', () => {
  const part = {
    executableCode: { id: 'code', code: 'print(1)', language: 'PYTHON' },
    thoughtSignature: 'opaque',
  };

  const native = call(part);
  part.executableCode.code = 'changed';

  expect(native.id).toBe('code');
  expect(native.nativePart).toEqual({
    executableCode: { id: 'code', code: 'print(1)', language: 'PYTHON' },
    thoughtSignature: 'opaque',
  });
});

test.each([
  ['OUTCOME_OK', 'completed'],
  ['OUTCOME_FAILED', 'failed'],
  ['OUTCOME_DEADLINE_EXCEEDED', 'failed'],
])('maps code execution outcome %s', (outcome, status) => {
  const native = call({
    executableCode: { id: 'code', code: 'print(1)', language: 'PYTHON' },
  });

  const result = readGoogleProviderResult(
    native,
    {
      codeExecutionResult: { id: 'code', outcome, output: 'readable result' },
      thoughtSignature: 'opaque-result',
    },
    200,
  );

  expect(result?.step).toMatchObject({
    status,
    builtin: 'code_execution',
    provider: 'google',
    startedAt: 100,
    settledAt: 200,
  });
  expect(result?.content).toContain('readable result');
  if (status === 'failed')
    expect(result?.step.error).toEqual({
      code: outcome,
      message: 'readable result',
    });
});

test('does not invent code success from an unspecified outcome', () => {
  const native = call({ executableCode: { code: '', language: 'PYTHON' } });

  const result = readGoogleProviderResult(
    native,
    { codeExecutionResult: { outcome: 'OUTCOME_UNSPECIFIED' } },
    200,
  );

  expect(result).toBeUndefined();
  expect(native.id).toBe('generated');
});

test('correlates a result only to its native ID and rejects incompatible known IDs', () => {
  const search = call();
  const fetch = call({
    toolCall: {
      id: 'fetch',
      toolType: 'URL_CONTEXT',
      args: { urls: ['https://example.test'] },
    },
  });

  const matched = matchGoogleProviderResult(
    { toolResponse: { id: 'fetch', toolType: 'URL_CONTEXT', response: {} } },
    [search, fetch],
  );
  const unknown = matchGoogleProviderResult(
    { toolResponse: { id: 'other', toolType: 'URL_CONTEXT', response: {} } },
    [search, fetch],
  );

  expect(matched).toBe(fetch);
  expect(unknown).toBeUndefined();
  expect(() =>
    matchGoogleProviderResult(
      { toolResponse: { id: 'search', toolType: 'URL_CONTEXT', response: {} } },
      [search, fetch],
    ),
  ).toThrow('incompatible');
});

test('pairs ID-less code only when one compatible invocation is pending', () => {
  const first = call({
    executableCode: { code: 'print(1)', language: 'PYTHON' },
  });
  const second = readGoogleProviderCall(
    { executableCode: { code: 'print(2)', language: 'PYTHON' } },
    'second',
    100,
  );
  if (!second) throw new Error('Expected code invocation');
  const result = {
    codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' },
  };

  const matched = matchGoogleProviderResult(result, [first]);

  expect(matched).toBe(first);
  expect(() => matchGoogleProviderResult(result, [first, second])).toThrow(
    'ambiguous',
  );
});

test('retains typed tool failures and readable URL retrieval errors', () => {
  const fetch = call({
    toolCall: {
      id: 'fetch',
      toolType: 'URL_CONTEXT',
      args: { urls: ['https://private.test'] },
    },
  });
  const search = call();

  const failedFetch = readGoogleProviderResult(
    fetch,
    {
      toolResponse: {
        id: 'fetch',
        toolType: 'URL_CONTEXT',
        response: {
          url_metadata: [
            {
              retrieved_url: 'https://private.test',
              url_retrieval_status: 'URL_RETRIEVAL_STATUS_PAYWALL',
            },
          ],
        },
      },
    },
    200,
  );
  const failedSearch = readGoogleProviderResult(
    search,
    {
      toolResponse: {
        id: 'search',
        toolType: 'GOOGLE_SEARCH_WEB',
        response: {
          error: { code: 'UNAVAILABLE', message: 'Search unavailable' },
        },
      },
    },
    200,
  );

  expect(failedFetch?.step).toMatchObject({
    status: 'failed',
    error: { code: 'URL_RETRIEVAL_STATUS_PAYWALL' },
  });
  expect(failedFetch?.content).toContain('https://private.test');
  expect(failedSearch?.step.error).toEqual({
    code: 'UNAVAILABLE',
    message: 'Search unavailable',
  });
});

test('normalizes successful fetched URLs with stable sources and timing', () => {
  const fetch = call({
    toolCall: {
      id: 'fetch',
      toolType: 'URL_CONTEXT',
      args: { urls: ['https://example.test'] },
    },
  });

  const result = readGoogleProviderResult(
    fetch,
    {
      toolResponse: {
        id: 'fetch',
        toolType: 'URL_CONTEXT',
        response: {
          urlMetadata: [
            {
              retrievedUrl: 'https://example.test',
              urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
            },
          ],
        },
      },
    },
    50,
  );

  expect(result?.step).toMatchObject({
    status: 'completed',
    settledAt: 100,
    label: "Fetched 'https://example.test'",
    sources: [
      {
        id: 'fetch:0',
        kind: 'url',
        title: 'https://example.test',
        href: 'https://example.test',
      },
    ],
  });
});

test('does not widen deferred tools or malformed native IDs into supported invocations', () => {
  const deferred = {
    toolCall: { id: 'file', toolType: 'FILE_SEARCH', args: {} },
  };
  const malformed = {
    toolCall: { id: '', toolType: 'GOOGLE_SEARCH_WEB', args: {} },
  };

  const first = readGoogleProviderCall(deferred, 'generated', 100);
  const second = readGoogleProviderCall(malformed, 'generated', 100);

  expect(first).toBeUndefined();
  expect(second).toBeUndefined();
});

test('does not settle an ID-less server tool response by guessing its invocation', () => {
  const search = call();

  const result = matchGoogleProviderResult(
    { toolResponse: { toolType: 'GOOGLE_SEARCH_WEB', response: {} } },
    [search],
  );

  expect(result).toBeUndefined();
});

test('keeps a URL retrieval failure visible even when the result omits its URL', () => {
  const fetch = call({
    toolCall: {
      id: 'fetch',
      toolType: 'URL_CONTEXT',
      args: { urls: ['https://private.test'] },
    },
  });

  const result = readGoogleProviderResult(
    fetch,
    {
      toolResponse: {
        id: 'fetch',
        toolType: 'URL_CONTEXT',
        response: {
          urlMetadata: [{ urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR' }],
        },
      },
    },
    200,
  );

  expect(result?.step).toMatchObject({
    status: 'failed',
    error: { code: 'URL_RETRIEVAL_STATUS_ERROR' },
  });
  expect(result?.content).toContain('https://private.test');
});

test('owns host-realm SDK native tool and code parts', () => {
  const search = runInNewContext(
    `({ toolCall: { id: 's', toolType: 'GOOGLE_SEARCH_WEB', args: { queries: ['x'] } }, thoughtSignature: 'opaque' })`,
  );
  const code = runInNewContext(
    `({ executableCode: { language: 'PYTHON', code: 'print(1)' } })`,
  );

  const nativeSearch = readGoogleProviderCall(search, 'generated', 100);
  const nativeCode = readGoogleProviderCall(code, 'code-generated', 100);
  search.toolCall.args.queries.push('later');

  expect(nativeSearch?.nativePart).toEqual({
    toolCall: {
      id: 's',
      toolType: 'GOOGLE_SEARCH_WEB',
      args: { queries: ['x'] },
    },
    thoughtSignature: 'opaque',
  });
  expect(nativeCode?.nativePart).toEqual(code);
});
