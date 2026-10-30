---
title: 'Custom Provider: Hashbrown React Docs'
meta:
  - name: description
    content: 'Map a provider SDK stream to canonical AG-UI events for Hashbrown.'
---

# Custom Provider

<hb-docs-demo demo="canonical-workbench-first-plan-react">
</hb-docs-demo>

A custom provider connects your model SDK to Hashbrown's existing client contract. We write the translation on the server: AG-UI input goes in, canonical events come out, and the HTTP route handles SSE. This is useful when an official adapter does not cover the backend you need.

The teaser demonstrates the existing OpenAI-backed client flow. It does not demonstrate a new provider.

<hb-diagram diagram="direct-provider-request-boundary">
</hb-diagram>

For an ASP.NET Core backend using OpenAI or Azure OpenAI, start with the [tested .NET integration](/docs/react/platform/dotnet).

Hashbrown's HTTP transport speaks AG-UI. A custom provider integration accepts an AG-UI `RunAgentInput`, calls the provider's native SDK, and yields canonical `AGUIEvent` values. The HTTP route then encodes those events as AG-UI SSE.

Use this approach when a vendor does not have an official Hashbrown package. If an official package exists, prefer it because it already covers provider-specific message, tool, reasoning, structured-output, cancellation, and error behavior.

## Provider Boundary

A provider integration is responsible for:

1. Accepting `RunAgentInput` from `@ag-ui/core`
2. Selecting the model and credentials on the server
3. Mapping AG-UI messages, tools, and Hashbrown extensions to the provider SDK
4. Mapping the provider stream to an `AsyncIterable<AGUIEvent>`
5. Preserving AG-UI run, text, tool-call, reasoning, and error lifecycle ordering
6. Stopping provider work when the supplied `AbortSignal` is aborted

Consume AG-UI types directly in the provider package. Do not duplicate or re-export them from your adapter.

## Input

Hashbrown sends a standard AG-UI run input. For framework-specific generation modes it adds a `hashbrown` object inside `forwardedProps`, AG-UI's extension point for values the agent reads and intermediaries pass through untouched.

```ts
import type { RunAgentInput } from '@ag-ui/core';

export interface CustomHashbrownRunAgentInput extends RunAgentInput {
  forwardedProps?: {
    hashbrown?: {
      responseSchema?: object;
      ui?: boolean;
    };
  };
}

export interface CustomTextStreamOptions {
  apiKey: string;
  model: string;
  input: CustomHashbrownRunAgentInput;
  signal?: AbortSignal;
  transformRequestOptions?: (
    options: ProviderRequest,
  ) => ProviderRequest | Promise<ProviderRequest>;
}
```

The client does not choose a provider model. Bind a model to the endpoint, choose one from authenticated server-side policy, or expose separate endpoints for separate model classes.

## Map the Provider Stream

<hb-diagram diagram="custom-provider-event-lifecycle">
</hb-diagram>

The exact SDK types differ by vendor, but the event lifecycle remains the same. This focused text example shows the required run and message events.

```ts
import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { YourProviderSDK } from 'your-provider-sdk';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapMessages(messages: Message[]): ProviderMessage[] {
  // Map every role and content shape supported by your provider.
  return messages.map((message) => mapMessage(message));
}

export async function* text(
  options: CustomTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { apiKey, model, input, signal, transformRequestOptions } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  const client = new YourProviderSDK({ apiKey });
  let textStarted = false;

  yield { type: EventType.RUN_STARTED, threadId, runId };

  try {
    const baseRequest: ProviderRequest = {
      model,
      messages: mapMessages(input.messages),
      tools: mapTools(input.tools),
      responseSchema: input.forwardedProps?.hashbrown?.responseSchema,
      stream: true,
    };
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    const stream = client.stream(request, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) return;

      const delta = readTextDelta(chunk);
      if (!delta) continue;

      if (!textStarted) {
        textStarted = true;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        };
      }

      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
      };
    }

    if (signal?.aborted) return;
    if (textStarted) {
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
    }
    yield { type: EventType.RUN_FINISHED, threadId, runId };
  } catch (error: unknown) {
    if (!signal?.aborted) {
      yield { type: EventType.RUN_ERROR, message: normalizeError(error) };
    }
  }
}
```

For tool calls, emit `TOOL_CALL_START` once the call ID and name are known, stream argument fragments with `TOOL_CALL_ARGS`, and finish with `TOOL_CALL_END`. Preserve the provider's call ID so later tool-result messages correlate correctly. Tool-result messages, like user messages, can carry content parts instead of a string, so map them or reject them with a clear error, as the official providers do. Map provider reasoning to AG-UI reasoning events and use `RAW` for useful provider details that have no canonical event.

To report how the model stopped and what it used, put the counts in AG-UI's standard `usage` field on `RUN_FINISHED`, and put a normalized reason under `metadata.hashbrown.finishReason`: `stop`, `length`, `tool_calls`, `content_filter`, `refusal`, or `other`. Keep the provider's own reason under a key of your own, for example `metadata.myProvider.stopReason`. Hashbrown exposes these as `lastRunUsage` and `lastRunFinishReason`. A truncated or filtered answer still ends with `RUN_FINISHED`; use `RUN_ERROR` only for failures.

```ts
yield {
  type: EventType.RUN_FINISHED,
  threadId,
  runId,
  usage: [{ provider: 'my-provider', model, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }],
  metadata: {
    hashbrown: { finishReason: 'length' },
    myProvider: { stopReason: 'max_tokens' },
  },
};
```

If the provider supports native structured output, map `input.forwardedProps?.hashbrown?.responseSchema` to that capability. Hashbrown continues to incrementally parse the resulting assistant text; the provider integration should not add a second parser or validate the full output itself.

## Expose POST `/run`

SSE encoding belongs at the HTTP boundary, not in the provider mapper.

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import express from 'express';
import { text } from './text';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const events = text({
    apiKey: process.env.PROVIDER_API_KEY!,
    model: process.env.PROVIDER_MODEL!,
    input: req.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Content-Type', encoder.getContentType());
  res.header('Connection', 'keep-alive');
  res.flushHeaders();

  for await (const event of events) {
    res.write(encoder.encodeSSE(event));
  }

  if (!res.writableEnded) {
    res.end();
  }
});
```

Point React at the endpoint:

```tsx
import { HashbrownProvider } from '@hashbrownai/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <HashbrownProvider url="/run">{children}</HashbrownProvider>;
}
```

## Test the Contract

Test event sequences rather than encoded bytes:

- Parse every yielded value with `EventSchemas.parse(...)` from `@ag-ui/core/schemas`. AG-UI 1.0 moved its validators to that entry point, and they need `zod` installed.
- Cover text, tool calls with fragmented arguments, reasoning, structured output, and provider errors.
- Assert one `RUN_STARTED` and one terminal event for completed runs.
- Assert cancellation stops the provider stream without emitting a synthetic error.
- Run an HTTP smoke test that decodes the SSE response with an AG-UI client.

Use the [OpenAI provider](https://github.com/liveloveapp/hashbrown/tree/main/packages/openai) as a compact reference and compare other official providers for vendor-specific reasoning and tool-call behavior.

## Explore it in the workbench

Open the workbench below. Send one prompt and inspect **Requests**, **JSON**, and **UI**. Follow a single run from its input to the text events and resolved component props.

<hb-workbench-launcher lesson="first-plan">
</hb-workbench-launcher>

Use this as a client-side comparison for your own adapter's contract tests. The checked [workbench server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts) calls the official OpenAI adapter; it does not call the custom provider you are writing. Verify your provider's lifecycle, cancellation, tool continuations, and schema handling with the tests above before connecting it to your application.
