---
title: 'Decisions in Agents: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Make typed decisions inside an agent with TypeSafe, or send browser decisions to an AG-UI agent server.'
---

# Decisions in Agents

<p class="subtitle">Make typed decisions inside an agent with TypeSafe, or send browser decisions to an AG-UI agent server.</p>

1. Most decisions an agent needs never reach the browser. Make them on the server, inside a tool or a graph node.
2. `HashbrownTypeSafe.decide` asks the questions, and `decodeDecision` turns the answer into typed values with confidence.
3. If your only backend is an AG-UI agent server, a small custom decision transport can send browser decisions to it.

---

## When to Decide Inside an Agent

An agent makes many small choices between model calls. Which step runs next, whether a tool call needs approval, how to classify a message, and which model or flow should handle it. These are closed questions with a known set of answers, and the browser never needs to make them.

A decision model answers them faster and more cheaply than a language model, and it says how sure it is. This is the common pattern for decision models in agents. CopilotKit's Jev cookbook calls the model inside a custom agent, and LangGraph apps use classifier nodes the same way.

Decide in the browser, with `decisionResource`, when the answer changes what the user sees. Decide in the agent when the answer changes what the agent does.

---

## Recipe A: A Decision as an Agent Tool or Node

Write a server function that takes the agent's state or conversation text and returns typed answers. Your agent framework calls it from a tool, a node or a router.

<hb-code-example header="next-step.ts">

```ts
import { decodeDecision, DecisionResponseError, s } from '@hashbrownai/core';
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';

export const nextStepSchema = s.object('Next step for a support conversation', {
  step: s.enumeration('What the agent should do next', {
    refund: 'Start a refund for the order',
    lookup: 'Look up the order before answering',
    answer: 'Answer from what is already known',
    human: 'Hand the conversation to a person',
  }),
  urgent: s.boolean('The customer says the problem is urgent'),
});

const MIN_CONFIDENCE = 0.7;

export type NextStep = {
  step: 'refund' | 'lookup' | 'answer' | 'human';
  urgent: boolean;
  confidence: number;
};

/**
 * Decides the next step for an agent. Returns `null` when the decision is
 * unsure or fails, so the agent can fall back to its language model.
 */
export async function decideNextStep(
  conversation: string,
  signal?: AbortSignal,
): Promise<NextStep | null> {
  try {
    const response = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      schema: nextStepSchema,
      request: { state: conversation },
      signal,
    });
    const { value, meta } = decodeDecision(nextStepSchema, response);
    const confidence = meta.step.confidence;

    if (confidence < MIN_CONFIDENCE) {
      return null;
    }

    return { step: value.step, urgent: value.urgent, confidence };
  } catch (error) {
    if (error instanceof DecisionError) {
      console.warn(`Decision failed (${error.code}): ${error.message}`);
      return null;
    }
    if (error instanceof DecisionResponseError) {
      console.warn(`Decision response did not match: ${error.message}`);
      return null;
    }
    throw error;
  }
}
```

</hb-code-example>

1. The `schema` pins the questions on the server. The request only needs `state`, which can be text or JSON.
2. `HashbrownTypeSafe.decide` returns the untyped decision response. `decodeDecision` checks it against the schema and returns `value` and `meta` typed from it.
3. `meta` mirrors `value`. An enumeration has `confidence` and `probabilities`, and a boolean has a `probability`.
4. The function returns `null` when it is not sure, so the agent can fall back to its language model.

### Calling it from a node

Graph frameworks such as LangGraph run a node with the current state and merge the update it returns. This sketch is illustrative and does not use any framework's API.

<hb-code-example header="route-node.ts">

```ts
import { decideNextStep } from './next-step';

type Message = { role: 'user' | 'assistant'; content: string };
type SupportState = { messages: Message[]; nextStep?: string };

// Illustrative only: a graph node that takes state and returns an update.
export async function routeNode(
  state: SupportState,
): Promise<Partial<SupportState>> {
  const transcript = state.messages
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');

  const decision = await decideNextStep(transcript);

  // Unsure or failed: let the language model choose.
  return { nextStep: decision?.step ?? 'llm' };
}
```

</hb-code-example>

A conditional edge then reads `nextStep` and sends the run to the refund tool, the order lookup, a person, or the language model.

### Handling errors

`HashbrownTypeSafe.decide` throws a `DecisionError` for every failure of the request, TypeSafe or the network. Its `code` is one of `invalid_request`, `unauthorized`, `rate_limited`, `upstream` or `invalid_response`. The adapter already retries rate limits twice. `decodeDecision` throws a `DecisionResponseError` from `@hashbrownai/core` when the response does not match the schema.

In an agent, a failed decision should rarely fail the run. Log it and fall back to the language model, as the example does. Let anything else, such as an aborted `signal` or an invalid schema, reach your error handler. See [TypeSafe](/docs/angular/platform/typesafe) for the full list.

### Routing on confidence

Act on a decision only when it is sure. Compare `confidence` (or `probability` for a boolean) to a threshold, start around 0.7, and tune it against real conversations. See [Confidence Routing](/docs/angular/concept/decisions#confidence-routing).

---

## Recipe B: Decisions over AG-UI

Use this recipe when your only backend is an AG-UI agent server, such as a hosted agent with no app server for an `/api/decide` route. The browser sends each decision as a short AG-UI run, and the agent server answers it. You write both halves. Hashbrown may adopt this design into core when there is demand.

### The conventions

| Part      | Convention                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| Request   | A `RunAgentInput` with no messages. The decision request goes in `forwardedProps.hashbrown.decision`, as it is.   |
| Response  | `RUN_STARTED`, then `RUN_FINISHED` whose `result` is the decision response envelope, unchanged.                   |
| Errors    | `RUN_ERROR` with a `hashbrown.decision.<code>` code. `rate_limited` and `upstream` are retryable, others are not. |
| No result | A run that finishes without a `result` fails with `hashbrown.decision.missing_result`.                            |
| Outcomes  | A cancelled run is an abort. An interrupted run is a protocol error, because a decision cannot resume.            |

### The client transport

A decision transport is a function that takes the request and an `AbortSignal` and returns the response envelope. Its type is `DecisionTransport` from `@hashbrownai/core`. This one posts the run, reads the server-sent events, and returns `RUN_FINISHED.result`. It needs no extra dependency.

<hb-code-example header="ag-ui-decision-transport.ts">

```ts
import {
  type Decision,
  type DecisionTransport,
  TransportError,
} from '@hashbrownai/core';

type AgUiEvent = {
  type: string;
  message?: string;
  code?: string;
  outcome?: { type: string };
  result?: unknown;
};

const RETRYABLE = new Set([
  'hashbrown.decision.rate_limited',
  'hashbrown.decision.upstream',
]);

export function createAgUiDecisionTransport(
  options: { url?: string; fetch?: typeof fetch } = {},
): DecisionTransport {
  const url = options.url ?? '/api/agent/decide';
  const doFetch = options.fetch ?? fetch;

  return async (request, signal) => {
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        threadId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        state: {},
        messages: [],
        tools: [],
        context: [],
        forwardedProps: { hashbrown: { decision: request } },
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new TransportError(`Decision run failed (${response.status})`, {
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    for await (const event of readEvents(response.body, signal)) {
      if (event.type === 'RUN_ERROR') {
        throw new TransportError(event.message ?? 'Decision run failed', {
          code: event.code,
          retryable: RETRYABLE.has(event.code ?? ''),
        });
      }
      if (event.type !== 'RUN_FINISHED') continue;

      if (event.outcome?.type === 'cancelled') {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      if (event.outcome?.type === 'interrupt') {
        throw new TransportError('A decision run cannot be interrupted', {
          code: 'PROTOCOL_ERROR',
          retryable: false,
        });
      }
      if (event.result === undefined) {
        throw new TransportError('The decision run finished without a result', {
          code: 'hashbrown.decision.missing_result',
          retryable: false,
        });
      }
      return event.result as Decision.Response;
    }

    // The stream closed before a terminal event, so the run may be retried.
    throw new TransportError('The decision stream ended early');
  };
}

async function* readEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<AgUiEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        // A dropped connection, like an early end, may be retried.
        throw new TransportError('The decision stream failed');
      }
      const { done } = chunk;
      buffer += done
        ? decoder.decode()
        : decoder.decode(chunk.value, { stream: true });
      // A trailing \r may be half of \r\n, so hold it until more arrives.
      const held = !done && buffer.endsWith('\r');
      const lines = (held ? buffer.slice(0, -1) : buffer).split(/\r\n|\r|\n/);
      buffer = done ? '' : (lines.pop() ?? '') + (held ? '\r' : '');
      // At the end, a blank line flushes any pending data.
      if (done) lines.push('');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } else if (line === '' && data.length > 0) {
          yield JSON.parse(data.join('\n')) as AgUiEvent;
          data = [];
        }
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
```

</hb-code-example>

1. Each decision is a new run with a fresh `threadId` and `runId`, so it never enters a conversation's history.
2. A `TransportError` marked `retryable` is retried up to the decision's `retries`. Any other error fails the decision.
3. A non-2xx response fails before the stream is read: 429 and 5xx are retryable, and any other status, such as the server's 400 for an invalid request, is not.
4. A connection that drops mid-stream is retryable, like a stream that ends early. If the server ends the run as `cancelled` while the local signal is not aborted, the transport throws an `AbortError`, and the decision shows it as an error.
5. The transport returns the envelope as it arrived. Hashbrown decodes and validates it, exactly as with the HTTP transport.

Pass the transport to `provideHashbrown`. Every `decisionResource` and `uiDecisionResource` uses the agent server for decisions, and chat still uses `baseUrl`.

<hb-code-example header="app.config.ts">

```ts
import type { ApplicationConfig } from '@angular/core';
import { provideHashbrown } from '@hashbrownai/angular';
import { createAgUiDecisionTransport } from './ag-ui-decision-transport';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      baseUrl: '/api/agent',
      decision: {
        transport: createAgUiDecisionTransport({ url: '/api/agent/decide' }),
      },
    }),
  ],
};
```

</hb-code-example>

### The server

On the agent server, read the request from `forwardedProps` and answer it with `HashbrownTypeSafe.decide` before opening the stream. This handler uses `@ag-ui/encoder`, as the atc example server does.

<hb-code-example header="decision-run.ts">

```ts
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import type { ServerResponse } from 'node:http';
import { nextStepSchema } from './next-step';

export async function runDecision(
  input: RunAgentInput,
  res: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  const { threadId, runId } = input;
  let terminal: AGUIEvent;

  try {
    const result = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      // Pins the questions: the client's questions are ignored.
      schema: nextStepSchema,
      request: input.forwardedProps?.hashbrown?.decision,
      signal,
    });
    terminal = { type: EventType.RUN_FINISHED, threadId, runId, result };
  } catch (error) {
    if (signal.aborted) return void res.end();
    // A bad schema or a bug: let the framework answer 500.
    if (!(error instanceof DecisionError)) throw error;
    if (error.code === 'invalid_request') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return void res.end(
        JSON.stringify({ code: error.code, message: error.message }),
      );
    }
    console.error(error);
    terminal = {
      type: EventType.RUN_ERROR,
      message: 'Decision failed',
      code: `hashbrown.decision.${error.code}`,
    };
  }

  const encoder = new EventEncoder();
  res.writeHead(200, {
    'Content-Type': encoder.getContentType(),
    'Cache-Control': 'no-cache',
  });
  res.write(
    encoder.encodeSSE({ type: EventType.RUN_STARTED, threadId, runId }),
  );
  res.write(encoder.encodeSSE(terminal));
  res.end();
}
```

</hb-code-example>

1. `decide` runs before any response is written. It validates the request, so a missing or malformed `forwardedProps.hashbrown.decision` is answered with a plain HTTP 400 and no stream.
2. Passing the same `schema` the browser uses pins the questions, so a client cannot ask anything it likes.
3. Any other `DecisionError` opens the stream and ends the run with `RUN_ERROR` and a `hashbrown.decision.<code>` code. Its details are logged on the server, not sent to the client.
4. Anything else, such as an invalid schema or a bug, is rethrown so your framework answers 500.

---

## Testing Without Keys

Neither recipe needs an API key in tests. Stub the endpoint.

- For Recipe A, pass a `fetch` to `HashbrownTypeSafe.decide` that returns a canned answer, or replace `decideNextStep` in the agent's tests.
- For Recipe B, give the transport a `fetch` that returns a server-sent event stream, and test the server handler with a stubbed `decide`.

The tests below use the global `Response`, `ReadableStream` and `TextDecoder`, so they need Node 18 or later, or another test environment with `fetch`.

<hb-code-example header="ag-ui-decision-transport.spec.ts">

```ts
import { type Decision, decodeDecision } from '@hashbrownai/core';
import { createAgUiDecisionTransport } from './ag-ui-decision-transport';
import { nextStepSchema } from './next-step';

const envelope: Decision.Response = {
  kind: 'hashbrown.decision',
  version: 1,
  value: { step: 'refund', urgent: false },
  meta: {
    step: {
      confidence: 0.92,
      probabilities: { refund: 0.92, lookup: 0.05, answer: 0.02, human: 0.01 },
    },
    urgent: { probability: 0.1 },
  },
};

function sse(...events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

test('returns RUN_FINISHED.result as the decision', async () => {
  const transport = createAgUiDecisionTransport({
    fetch: async () =>
      sse(
        { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
        { type: 'RUN_FINISHED', threadId: 't', runId: 'r', result: envelope },
      ),
  });
  const request: Decision.Request = { state: 'Refund me', questions: {} };

  const response = await transport(request, new AbortController().signal);

  expect(decodeDecision(nextStepSchema, response).value.step).toBe('refund');
});

test('maps a retryable RUN_ERROR code to a retryable error', async () => {
  const transport = createAgUiDecisionTransport({
    fetch: async () =>
      sse(
        { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
        {
          type: 'RUN_ERROR',
          message: 'Decision failed',
          code: 'hashbrown.decision.rate_limited',
        },
      ),
  });
  const request: Decision.Request = { state: 'Refund me', questions: {} };

  const result = transport(request, new AbortController().signal);

  await expect(result).rejects.toMatchObject({
    code: 'hashbrown.decision.rate_limited',
    retryable: true,
  });
});

test('fails a run that finishes without a result', async () => {
  const transport = createAgUiDecisionTransport({
    fetch: async () =>
      sse(
        { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
        { type: 'RUN_FINISHED', threadId: 't', runId: 'r' },
      ),
  });
  const request: Decision.Request = { state: 'Refund me', questions: {} };

  const result = transport(request, new AbortController().signal);

  await expect(result).rejects.toMatchObject({
    code: 'hashbrown.decision.missing_result',
    retryable: false,
  });
});
```

</hb-code-example>

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/decisions">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Decisions</h4>
      <p>Ask typed closed questions from the browser.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="recipes/ui-selection">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>UI Selection</h4>
      <p>Choose components for an input with a decision.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="platform/typesafe">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>TypeSafe</h4>
      <p>Answer decisions with TypeSafe's Jev model.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
