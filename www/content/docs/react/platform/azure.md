---
title: 'Microsoft Azure OpenAI: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Microsoft Azure OpenAI adapter maps AG-UI runs to the Azure OpenAI Responses API, with reasoning, and streams canonical AG-UI events.'
---

# Microsoft Azure OpenAI

Install the Azure adapter, the Azure OpenAI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/azure openai @ag-ui/core @ag-ui/encoder
```

## Client Configuration

Pass the official SDK's `AzureClientOptions` directly as `clientOptions`. This supports API keys, Microsoft Entra token providers, Azure endpoints, retries, and custom fetch implementations without Hashbrown wrapping those options. The model remains server configuration and is not read from the client run input.

Set `endpoint` and an `apiVersion` that supports the Responses API (for example `'2025-04-01-preview'`). Requests go to `{endpoint}/openai/responses?api-version=…`.

Do not set `clientOptions.deployment`. The Responses API selects the deployment through the `model` option, so pass your deployment name as `model`. Setting `deployment` fails the run with a `RUN_ERROR` that tells you to remove it.

**API key:**

```ts
HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
  },
  model: process.env.AZURE_MODEL!,
  input,
});
```

**Microsoft Entra token provider:**

```ts
HashbrownAzure.stream.text({
  clientOptions: {
    azureADTokenProvider,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
  },
  model: process.env.AZURE_MODEL!,
  input,
});
```

## Streaming Text Responses

`HashbrownAzure.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. Encode those events as AG-UI SSE at your HTTP boundary.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `clientOptions`           | `AzureClientOptions`                    | Official Azure OpenAI SDK configuration, passed through unchanged.                                         |
| `model`                   | `string`                                | Azure deployment name, sent as the Responses request `model`.                                              |
| `input`                   | `AzureHashbrownRunAgentInput`           | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Azure OpenAI request when the HTTP client disconnects.                            |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `reasoning`               | `boolean \| { effort?, summary? }`      | _(Optional)_ Controls the `reasoning` request parameter. See [Reasoning](#reasoning).                      |
| `builtInTools`            | `{ webSearch?: true \| object }`        | _(Optional)_ Turns on provider-run tools. See [Built-in Tools](#built-in-tools).                           |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Responses request (`ResponseCreateParamsStreaming`).           |

The adapter maps system and developer instructions, message history, tool definitions, tool results, and native structured output. Provider and mapping failures are emitted as `RUN_ERROR` events.

### Responses API

The adapter streams from the Responses API on your Azure OpenAI resource. Every request sends `store: false`, and Hashbrown replays earlier turns, including earlier reasoning, from the history your client sends.

### Reasoning

Hashbrown decides whether to request reasoning from the `model` option, which is your deployment name. If the name starts with `o` and a digit, `gpt-5`, or `gpt-` followed by a major version of 5 or later, and is not a `-chat` variant such as `gpt-5-chat-latest`, Hashbrown sends `reasoning: { summary: 'auto' }` and `include: ['reasoning.encrypted_content']`, and leaves `effort` to the model.

A deployment name often does not reveal the model behind it. Set `reasoning` explicitly in that case, to `true` or to an object:

```ts
const stream = HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
  },
  model: 'support-assistant',
  input,
  reasoning: { effort: 'low' },
});
```

- `reasoning: true` treats the deployment as a reasoning model whatever its name, and sends `reasoning: { summary: 'auto' }` and `include: ['reasoning.encrypted_content']`.
- `reasoning: { effort, summary }` is sent as given. A missing `summary` defaults to `'auto'`. `effort` is sent only when you set it.
- `reasoning: false` stops Hashbrown from requesting reasoning summaries. Use it when a non-reasoning deployment happens to have a name that matches. It does not turn reasoning off: a reasoning model may still return encrypted reasoning, which Hashbrown still replays on the next turn.

The client receives AG-UI `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, and `REASONING_MESSAGE_END` events for summary text and `REASONING_ENCRYPTED_VALUE` events for encrypted content. Assistant messages expose them as `reasoning` and `reasoningDetails`.

### Azure Differences

- Azure does not stream partial images.
- Reasoning summaries are not guaranteed on every request.
- The models and API versions available differ from OpenAI's and vary by region and resource.

This Azure route was verified against a mock server. Check it against your own resource before you depend on it in production.

### Structured Output

Set `input.forwardedProps.hashbrown.responseSchema` to use Azure OpenAI native JSON schema output:

```ts
const input = {
  ...runInput,
  forwardedProps: {
    hashbrown: {
      responseSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
        },
        required: ['answer'],
      },
    },
  },
};
```

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAzure } from '@hashbrownai/azure';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
    },
    model: process.env.AZURE_MODEL!,
    input: req.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Content-Type', encoder.getContentType());
  res.header('Connection', 'keep-alive');
  res.flushHeaders();

  for await (const event of stream) {
    res.write(encoder.encodeSSE(event));
  }

  if (!res.writableEnded) {
    res.end();
  }
});

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAzure } from '@hashbrownai/azure';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
    },
    model: process.env.AZURE_MODEL!,
    input: request.body as RunAgentInput,
    signal: abortController.signal,
  });
  const encoder = new EventEncoder();

  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Content-Type', encoder.getContentType());
  reply.header('Connection', 'keep-alive');

  for await (const event of stream) {
    reply.raw.write(encoder.encodeSSE(event));
  }

  if (!reply.raw.writableEnded) {
    reply.raw.end();
  }
});

fastify.listen({ port: 3000 });
```

</div>

<div backend="nestjs">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { HashbrownAzure } from '@hashbrownai/azure';
import type { Request, Response } from 'express';

@Controller()
export class RunController {
  @Post('run')
  async run(
    @Body() input: RunAgentInput,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const abortController = new AbortController();
    req.once('aborted', () => abortController.abort());
    res.once('close', () => abortController.abort());
    const stream = HashbrownAzure.stream.text({
      clientOptions: {
        apiKey: process.env.AZURE_API_KEY!,
        endpoint: process.env.AZURE_ENDPOINT!,
        apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
      },
      model: process.env.AZURE_MODEL!,
      input,
      signal: abortController.signal,
    });
    const encoder = new EventEncoder();

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Content-Type', encoder.getContentType());
    res.header('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const event of stream) {
      res.write(encoder.encodeSSE(event));
    }

    if (!res.writableEnded) {
      res.end();
    }
  }
}
```

</div>

<div backend="hono">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAzure } from '@hashbrownai/azure';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
    },
    model: process.env.AZURE_MODEL!,
    input,
    signal: c.req.raw.signal,
  });
  const encoder = new EventEncoder();
  const textEncoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          controller.enqueue(textEncoder.encode(encoder.encodeSSE(event)));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': encoder.getContentType(),
      },
    },
  );
});

export default app;
```

</div>

</hb-backend-code-example>

### Built-in Tools

Built-in tools run on the model provider instead of in your app or on your server. Turn them on with `builtInTools`. The keys are the camelCase form of the `builtin` value a call reports, so a key means the same capability on every Hashbrown provider adapter. Today the only key is `webSearch`.

```ts
const stream = HashbrownAzure.stream.text({
  clientOptions,
  model: process.env.AZURE_OPENAI_DEPLOYMENT!,
  input,
  signal,
  builtInTools: { webSearch: true },
});
```

Pass `true` for the provider defaults, or the tool's own configuration (for example `search_context_size`, `user_location` or `filters`), which is sent unchanged: `builtInTools: { webSearch: { search_context_size: 'low' } }`. Web search works with Azure OpenAI deployments that support the Responses API `web_search` tool; it ran on a `gpt-4.1-mini` deployment when we tested it. Availability depends on your Azure resource and region, and a request fails if the deployment does not support it. Sources and citations use the same mapping as the OpenAI adapter.

On the client, each search arrives as an entry in the assistant message's `serverToolCalls`, with `kind: 'provider'` and `builtin: 'web_search'`. Hashbrown never runs it, and a client tool with the same name is never called in its place. The entry carries a ready-to-show `label` (for example `Searched 'hashbrown ai' · 3 sources`), the `queries` it ran, the `sources` it found, and its `outcome`. A failed search settles as `complete` with `outcome: 'failure'` and an `error`. See [Server-Executed Tool Calls](/docs/react/concept/functions#server-executed-tool-calls) for every field.

The answer's `url_citation` annotations become `citations` on the assistant message. Each citation's `sourceId` is the `id` of one of the sources, and `quote` holds the cited text.

```tsx
export function Answer({ message }: { message: UiAssistantMessage<never> }) {
  return (
    <>
      {message.serverToolCalls?.map((call) => (
        <p key={call.toolCallId}>{call.label}</p>
      ))}
      {message.ui}
      <ul>
        {message.citations?.map((citation) => {
          const source = message.serverToolCalls
            ?.flatMap((call) => call.sources ?? [])
            .find((s) => s.id === citation.sourceId);

          return source?.href ? (
            <li
              key={`${citation.sourceId}-${citation.start ?? citation.quote}`}
            >
              <a href={source.href}>{source.title}</a>
            </li>
          ) : null;
        })}
      </ul>
    </>
  );
}
```

Azure OpenAI requires, as OpenAI does, inline citations to be clearly visible and clickable wherever your UI shows the answer. Source links carry `?utm_source=openai`; keep it.

Sources need the `builtInTools.webSearch` option, because it also requests `web_search_call.action.sources`. A `web_search` tool you add through `transformRequestOptions` instead still streams as a provider tool call, with a label and queries, but without sources.

### Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/react/concept/activities) for how the client renders them.

```ts
import { HashbrownAzure } from '@hashbrownai/azure';

const stream = HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: '2025-04-01-preview',
  },
  model: process.env.AZURE_MODEL!,
  input,
  signal,
  activities: async ({ activity, model }) => {
    const plan = activity.snapshot(`plan-${input.runId}`, 'plan', {
      steps: ['Read the question', 'Answer'],
      done: 0,
    });

    await model;

    plan.patch([{ op: 'replace', path: '/done', value: 2 }]);
  },
});
```

The callback receives an `activity` writer, a `model` promise, and the run's `signal`:

- `activity.snapshot(id, activityType, content)` sends an `ACTIVITY_SNAPSHOT` and returns a handle. The handle's `patch(operations)` sends an `ACTIVITY_DELTA` with RFC 6902 JSON Patch operations, and `replace(content)` sends a new snapshot.
- Activity ids must be unique within the thread. Reusing an id from an earlier turn updates that turn's activity in place, so the example builds the id from `input.runId` to give each run its own plan.
- `model` resolves when the model stream ends, before the run finishes, and rejects if the model call fails.
- Activity events and model events are sent in the order they happen. The callback starts after `RUN_STARTED`, and the terminal event waits until the callback settles. Model text streams as it arrives and is never held back.
- If the callback throws while the model is streaming, Hashbrown aborts the model and ends the run with one `RUN_ERROR`. If it throws after the model has finished, `RUN_ERROR` replaces `RUN_FINISHED`. If the model fails too, the model's error wins.
- When the client disconnects, `signal` aborts. No terminal event is sent, and writes become no-ops.
- A write after the run has closed throws, as does a second snapshot that reuses an id with a different `activityType`.

## Transform Request Options

`transformRequestOptions` receives the final Responses API request (`ResponseCreateParamsStreaming`) after AG-UI input has been mapped. Use it for server-owned provider settings.

```ts
const stream = HashbrownAzure.stream.text({
  clientOptions: {
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    apiVersion: process.env.AZURE_API_VERSION ?? '2025-04-01-preview',
  },
  model: process.env.AZURE_MODEL!,
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_output_tokens: 2048,
    reasoning: { ...options.reasoning, effort: 'low' },
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)
