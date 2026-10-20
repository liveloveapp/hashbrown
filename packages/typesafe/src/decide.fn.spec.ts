import { DecisionSchemaError, decodeDecision, s } from '@hashbrownai/core';
import type { Decision } from '@hashbrownai/core';
import { HashbrownTypeSafe } from './decide.fn';
import { DecisionError } from './decision-error';
import * as fromNative from './native/from-native';
import * as nativeResponse from './native/__fixtures__/response.json';

const request: Decision.Request = {
  state: 'Payouts have been failing for 3 days.',
  questions: {
    is_urgent: { type: 'yesNo', instructions: 'Does this convey urgency?' },
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      options: { billing: 'Payments and refunds', technical: null },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated is the customer?',
      levels: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as RequestInit });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? jsonResponse(nativeResponse);
  });
  return { fn: fn as unknown as typeof fetch, calls, mock: fn };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

test('posts to {baseURL}/v1/systemone with a bearer key', async () => {
  const { fn, calls } = fakeFetch();

  const result = await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'jev-1.14.0',
    request,
    fetch: fn,
  });

  expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(calls[0].init.method).toBe('POST');
  expect(
    (calls[0].init.headers as Record<string, string>)['Authorization'],
  ).toBe('Bearer k');
  expect(JSON.parse(calls[0].init.body as string).model).toBe('jev-1.14.0');
  expect(result.kind).toBe('hashbrown.decision');
  expect(result.value).toEqual({
    is_urgent: true,
    department: 'billing',
    frustration: 1,
  });
});

test('Gateway baseURL changes only the host and path prefix', async () => {
  const { fn, calls } = fakeFetch();

  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'jev-1.14.0',
    request,
    baseURL: 'https://ai-gateway.vercel.sh/typesafe/',
    fetch: fn,
  });

  expect(calls[0].url).toBe(
    'https://ai-gateway.vercel.sh/typesafe/v1/systemone',
  );
});

test('with schema, ignores client questions and compiles its own', async () => {
  const { fn, calls } = fakeFetch(
    jsonResponse({
      answers: { urgent: { type: 'noul', noul: 0.9 } },
    }),
  );

  const result = await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'jev-1.14.0',
    schema: s.object('d', { urgent: s.boolean('Is it urgent?') }),
    request: { state: 'x', questions: 'garbage' },
    fetch: fn,
  });

  const body = JSON.parse(calls[0].init.body as string);
  expect(Object.keys(body.questions)).toEqual(['urgent']);
  expect(result.value).toEqual({ urgent: true });
});

test('with schema, accepts a state-only request that decodeDecision types', async () => {
  const { fn, calls } = fakeFetch(
    jsonResponse({
      answers: { urgent: { type: 'noul', noul: 0.9 } },
    }),
  );
  const schema = s.object('d', { urgent: s.boolean('Is it urgent?') });

  const response = await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'jev-1.14.0',
    schema,
    request: { state: { ticket: 'Payouts failing' } },
    fetch: fn,
  });
  const result = decodeDecision(schema, response);

  const body = JSON.parse(calls[0].init.body as string);
  expect(Object.keys(body.questions)).toEqual(['urgent']);
  const urgent: boolean = result.value.urgent;
  expect(urgent).toBe(true);
  expect(result.meta.urgent.probability).toBe(0.9);
});

test('without schema, rejects malformed requests and never calls fetch', async () => {
  const { fn, mock } = fakeFetch();
  const bad: unknown[] = [
    null,
    'text',
    { questions: request.questions },
    { state: 'x' },
    { state: 'x', questions: [] },
    { state: 'x', questions: { q: { type: 'other', instructions: 'i' } } },
    { state: 'x', questions: { q: { type: 'yesNo', instructions: 1 } } },
    {
      state: 'x',
      questions: { q: { type: 'choice', instructions: 'i', options: {} } },
    },
    {
      state: 'x',
      questions: {
        q: { type: 'choice', instructions: 'i', options: { a: 3 } },
      },
    },
    {
      state: 'x',
      questions: {
        q: { type: 'score', instructions: 'i', levels: { '0': 'only' } },
      },
    },
    {
      state: 'x',
      questions: {
        q: {
          type: 'score',
          instructions: 'i',
          levels: { a: 'x', b: 'y' },
        },
      },
    },
    { ...request, options: { longContext: 'yes' } },
  ];

  for (const candidate of bad) {
    const error = await rejection(
      HashbrownTypeSafe.decide({
        apiKey: 'k',
        model: 'm',
        request: candidate,
        fetch: fn,
      }),
    );
    expect(error).toBeInstanceOf(DecisionError);
    expect((error as DecisionError).code).toBe('invalid_request');
    expect((error as DecisionError).status).toBe(400);
  }
  expect(mock).not.toHaveBeenCalled();
});

test('rejects more than 255 options and requests over 256,000 characters', async () => {
  const { fn, mock } = fakeFetch();
  const options = Object.fromEntries(
    Array.from({ length: 256 }, (_, i) => [`o${i}`, null]),
  );
  const tooManyOptions = {
    state: 'x',
    questions: { q: { type: 'choice', instructions: 'i', options } },
  };
  const tooLong = { state: 'x'.repeat(256_000), questions: request.questions };

  const errors = [
    await rejection(
      HashbrownTypeSafe.decide({
        apiKey: 'k',
        model: 'm',
        request: tooManyOptions,
        fetch: fn,
      }),
    ),
    await rejection(
      HashbrownTypeSafe.decide({
        apiKey: 'k',
        model: 'm',
        request: tooLong,
        fetch: fn,
      }),
    ),
    await rejection(
      HashbrownTypeSafe.decide({
        apiKey: 'k',
        model: 'm',
        schema: s.object('d', { urgent: s.boolean('Is it urgent?') }),
        request: { state: 'x'.repeat(256_000) },
        fetch: fn,
      }),
    ),
  ];

  for (const error of errors) {
    expect((error as DecisionError).code).toBe('invalid_request');
  }
  expect(mock).not.toHaveBeenCalled();
});

test('accepts requests up to 256,000 characters by default', async () => {
  const { fn, mock } = fakeFetch(jsonResponse(nativeResponse));

  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'm',
    request: { state: 'x'.repeat(200_000), questions: request.questions },
    fetch: fn,
  });

  expect(mock).toHaveBeenCalledTimes(1);
});

test('longContext raises the request cap to 1,048,000 characters', async () => {
  const { fn, mock } = fakeFetch(jsonResponse(nativeResponse));
  const longRequest = (state: string) => ({
    state,
    questions: request.questions,
    options: { longContext: true },
  });

  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'm',
    request: longRequest('x'.repeat(800_000)),
    fetch: fn,
  });
  const error = await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request: longRequest('x'.repeat(1_048_000)),
      fetch: fn,
    }),
  );

  expect(mock).toHaveBeenCalledTimes(1);
  expect((error as DecisionError).code).toBe('invalid_request');
  expect((error as DecisionError).message).toContain('1048000');
});

test('maxRequestChars sets a stricter cap', async () => {
  const { fn, mock } = fakeFetch();

  const error = await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request: { state: 'x'.repeat(2_000), questions: request.questions },
      maxRequestChars: 1_000,
      fetch: fn,
    }),
  );

  expect((error as DecisionError).code).toBe('invalid_request');
  expect((error as DecisionError).message).toContain('1000');
  expect(mock).not.toHaveBeenCalled();
});

test('retries 429 and 529 at most twice', async () => {
  jest.useFakeTimers();
  try {
    const { fn, mock } = fakeFetch(
      jsonResponse({}, 429),
      jsonResponse({}, 529),
      jsonResponse(nativeResponse),
    );

    const promise = HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: fn,
    });
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(mock).toHaveBeenCalledTimes(3);
    expect(result.kind).toBe('hashbrown.decision');
  } finally {
    jest.useRealTimers();
  }
});

test('maps exhausted retries to rate_limited', async () => {
  jest.useFakeTimers();
  try {
    const { fn, mock } = fakeFetch(
      jsonResponse({}, 429),
      jsonResponse({}, 429),
      jsonResponse({}, 429),
    );

    const promise = rejection(
      HashbrownTypeSafe.decide({ apiKey: 'k', model: 'm', request, fetch: fn }),
    );
    await jest.advanceTimersByTimeAsync(1000);
    const error = (await promise) as DecisionError;

    expect(mock).toHaveBeenCalledTimes(3);
    expect(error.code).toBe('rate_limited');
    expect(error.status).toBe(429);
  } finally {
    jest.useRealTimers();
  }
});

test('maps 401 to unauthorized and other non-2xx to upstream', async () => {
  const unauthorized = fakeFetch(jsonResponse({}, 401));
  const forbidden = fakeFetch(jsonResponse({}, 403));
  const failing = fakeFetch(jsonResponse({}, 500));

  const a = (await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: unauthorized.fn,
    }),
  )) as DecisionError;
  const b = (await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: forbidden.fn,
    }),
  )) as DecisionError;
  const c = (await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: failing.fn,
    }),
  )) as DecisionError;

  expect(a.code).toBe('unauthorized');
  expect(b.code).toBe('unauthorized');
  expect(c.code).toBe('upstream');
  expect(c.status).toBe(500);
  expect(failing.mock).toHaveBeenCalledTimes(1);
});

test('upstream errors carry the vendor error type and message', async () => {
  const gateway = fakeFetch(
    jsonResponse(
      {
        error: {
          message: 'AI Gateway requires a valid credit card on file.',
          type: 'customer_verification_required',
        },
      },
      403,
    ),
  );
  const typesafe = fakeFetch(
    jsonResponse(
      { message: 'questions.q.type: unknown', error_type: 'invalid_request' },
      422,
    ),
  );
  const text = fakeFetch(new Response('Bad gateway', { status: 502 }));
  const detail = fakeFetch(
    jsonResponse({ detail: { error_type: 'max_tokens_exceeded' } }, 400),
  );

  const [a, b, c, d] = (await Promise.all(
    [gateway, typesafe, text, detail].map(({ fn }) =>
      rejection(
        HashbrownTypeSafe.decide({
          apiKey: 'secret-key',
          model: 'm',
          request,
          fetch: fn,
        }),
      ),
    ),
  )) as DecisionError[];

  expect(a.code).toBe('unauthorized');
  expect(a.status).toBe(403);
  expect(a.message).toBe(
    'TypeSafe responded with status 403 (customer_verification_required): AI Gateway requires a valid credit card on file.',
  );
  expect(b.code).toBe('upstream');
  expect(b.message).toBe(
    'TypeSafe responded with status 422 (invalid_request): questions.q.type: unknown',
  );
  expect(c.message).toBe('TypeSafe responded with status 502: Bad gateway');
  expect(d.message).toBe(
    'TypeSafe responded with status 400 (max_tokens_exceeded)',
  );
  for (const error of [a, b, c, d]) {
    expect(error.message).not.toContain('secret-key');
  }
});

test('maps network failures to upstream 502 with a cause', async () => {
  const cause = new TypeError('fetch failed');
  const { fn } = fakeFetch(cause);

  const error = (await rejection(
    HashbrownTypeSafe.decide({ apiKey: 'k', model: 'm', request, fetch: fn }),
  )) as DecisionError;

  expect(error.code).toBe('upstream');
  expect(error.status).toBe(502);
  expect(error.cause).toBe(cause);
});

test('maps invalid native bodies to invalid_response', async () => {
  const notJson = fakeFetch(new Response('nope', { status: 200 }));
  const badAnswers = fakeFetch(jsonResponse({ answers: {} }));

  const a = (await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: notJson.fn,
    }),
  )) as DecisionError;
  const b = (await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      fetch: badAnswers.fn,
    }),
  )) as DecisionError;

  expect(a.code).toBe('invalid_response');
  expect(a.status).toBe(502);
  expect(b.code).toBe('invalid_response');
});

test('an aborted signal rejects with the abort reason', async () => {
  const controller = new AbortController();
  const reason = new Error('stop');
  controller.abort(reason);
  const fn = jest.fn(async (_url: unknown, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    return jsonResponse(nativeResponse);
  }) as unknown as typeof fetch;

  const error = await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      signal: controller.signal,
      fetch: fn,
    }),
  );

  expect(error).toBe(reason);
});

test('transformRequest edits the native body', async () => {
  const { fn, calls } = fakeFetch();

  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'm',
    request,
    transformRequest: (body) => ({ ...body, model: 'edited' }),
    fetch: fn,
  });

  expect(JSON.parse(calls[0].init.body as string).model).toBe('edited');
});

test('requires model', () => {
  const { fn } = fakeFetch();
  const options = { apiKey: 'k', request, fetch: fn };

  // @ts-expect-error model is required
  const call = () => HashbrownTypeSafe.decide(options);

  expect(typeof call).toBe('function');
});

test('longContext sends the TypeSafe long-context header', async () => {
  const { fn, calls } = fakeFetch(jsonResponse(nativeResponse));
  const plain = fakeFetch(jsonResponse(nativeResponse));

  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'm',
    request: { ...request, options: { longContext: true } },
    fetch: fn,
  });
  await HashbrownTypeSafe.decide({
    apiKey: 'k',
    model: 'm',
    request: { ...request, options: { longContext: false } },
    fetch: plain.fn,
  });

  const headers = calls[0].init.headers as Record<string, string>;
  const plainHeaders = plain.calls[0].init.headers as Record<string, string>;
  expect(headers['TypeSafe-Danger-Zone-Long-Context']).toBe('true');
  expect('TypeSafe-Danger-Zone-Long-Context' in plainHeaders).toBe(false);
  expect(JSON.parse(calls[0].init.body as string)).not.toHaveProperty(
    'options',
  );
});

test('a bad server schema rejects with DecisionSchemaError unchanged', async () => {
  const { fn, mock } = fakeFetch();
  const schema = s.object('d', {
    n: s.integer('N', { minimum: 0 }),
  }) as unknown as Parameters<typeof HashbrownTypeSafe.decide>[0]['schema'];

  const error = await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      schema,
      request: { state: 'x' },
      fetch: fn,
    }),
  );

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error).not.toBeInstanceOf(DecisionError);
  expect((error as DecisionSchemaError).path).toBe('n');
  expect(mock).not.toHaveBeenCalled();
});

test('a malformed answer field maps to invalid_response with a cause', async () => {
  const { fn } = fakeFetch(
    jsonResponse({
      answers: {
        ...nativeResponse.answers,
        frustration: {
          type: 'score',
          score: 1,
          probabilities: null,
          confidence: 0.5,
        },
      },
    }),
  );

  const error = (await rejection(
    HashbrownTypeSafe.decide({ apiKey: 'k', model: 'm', request, fetch: fn }),
  )) as DecisionError;

  expect(error).toBeInstanceOf(DecisionError);
  expect(error.code).toBe('invalid_response');
  expect(error.status).toBe(502);
  expect(error.cause).toBeInstanceOf(Error);
});

test('any mapper error maps to invalid_response with the original cause', async () => {
  const { fn } = fakeFetch();
  const cause = new TypeError('boom');
  const spy = jest
    .spyOn(fromNative, 'fromNativeResponse')
    .mockImplementation(() => {
      throw cause;
    });

  const error = (await rejection(
    HashbrownTypeSafe.decide({ apiKey: 'k', model: 'm', request, fetch: fn }),
  )) as DecisionError;
  spy.mockRestore();

  expect(error).toBeInstanceOf(DecisionError);
  expect(error.code).toBe('invalid_response');
  expect(error.status).toBe(502);
  expect(error.cause).toBe(cause);
});

test('an error thrown by transformRequest propagates unchanged', async () => {
  const { fn, mock } = fakeFetch();
  const thrown = new RangeError('server bug');

  const error = await rejection(
    HashbrownTypeSafe.decide({
      apiKey: 'k',
      model: 'm',
      request,
      transformRequest: () => {
        throw thrown;
      },
      fetch: fn,
    }),
  );

  expect(error).toBe(thrown);
  expect(mock).not.toHaveBeenCalled();
});
