---
title: 'Anthropic: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Anthropic adapter maps AG-UI runs to the Claude Messages API and streams canonical AG-UI events.'
---

# Anthropic

Install the Anthropic adapter, the official Anthropic SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/anthropic @anthropic-ai/sdk @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownAnthropic.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses Anthropic's streaming Messages API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                                                    |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | Anthropic API key.                                                                                             |
| `baseURL`                 | `string`                                | _(Optional)_ Anthropic-compatible API base URL.                                                                |
| `model`                   | `string`                                | Server-selected Anthropic model.                                                                               |
| `input`                   | `AnthropicHashbrownRunAgentInput`       | AG-UI run input, including messages and tools.                                                                 |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Anthropic request when the HTTP client disconnects.                                   |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities).     |
| `builtInTools`            | `AnthropicBuiltInTools`                 | _(Optional)_ Enables server-side web search, fetch, and code execution. See [Built-in Tools](#built-in-tools). |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Messages API request.                                              |

The adapter maps system and developer instructions, message history, tool definitions, tool results, and native structured output. Claude thinking, signatures, and redacted thinking become AG-UI reasoning records that can be sent back on continuation. Provider metadata and unsupported native events are preserved as AG-UI `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.forwardedProps.hashbrown.responseSchema` to use Anthropic native structured output on a model that supports it:

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
        additionalProperties: false,
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
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
    const stream = HashbrownAnthropic.stream.text({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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

## Extended Thinking

Enable provider-owned reasoning settings with `transformRequestOptions`. Hashbrown emits Claude thinking and redacted thinking as AG-UI reasoning events and preserves their signatures for subsequent requests.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: 1024 },
  }),
});
```

## Built-in Tools

Enable Anthropic's server tools with `builtInTools`:

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL!,
  input,
  builtInTools: {
    webSearch: true,
    webFetch: true,
    codeExecution: true,
  },
});
```

Choose a model that supports the selected Anthropic tool versions. `true` enables
`web_search_20250305`, `web_fetch_20250910`, or `code_execution_20250825` respectively.
Fetch citations are enabled for `webFetch: true`. To select another SDK-supported
version or configure limits, pass Anthropic's configuration without its fixed tool
name:

```ts
builtInTools: {
  webSearch: { type: 'web_search_20250305', max_uses: 3 },
  webFetch: {
    type: 'web_fetch_20250910',
    citations: { enabled: true },
  },
}
```

Object configurations pass through unchanged, including an explicit choice to
disable fetch citations. Tools added through `transformRequestOptions` also produce
provider steps when their native calls belong to these supported tool families.

Search, fetch, and code execution appear in `serverToolCalls` with labels, timing,
sources, and a settled outcome. A native server call starts as soon as its invocation
arrives and settles when its result arrives. Provider failures retain readable errors.
These calls run at Anthropic and never invoke a same-named client tool.

Answer citations reference the sources exposed on tool calls or the assistant
message. Render citations as visible source links alongside the answer. File sources
retain their native file ids so your application can retrieve output files. Hashbrown
supplies the state; your application renders it.

### Native Conversation History

The adapter preserves ordered native content, including interleaved thinking,
signatures, encrypted search/code output, server results, and container information.
Hashbrown folds a `hashbrown.provider-history` CUSTOM footer into canonical message
metadata so this content survives persistence and subsequent requests. The footer
adds no display message and does not delay tool results.

Keep canonical history and its metadata when saving or forwarding a conversation.
The next request replays complete native history once, preserving ordinary app-tool
results in their original positions. Older histories without a native envelope retain
the existing reasoning fallback; native server continuations that cannot be safely
reconstructed fail with an explicit error. Provider calls are never converted into
ordinary app-function calls.

## Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/react/concept/activities) for how the client renders them.

```ts
import { HashbrownAnthropic } from '@hashbrownai/anthropic';

const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-haiku-4-5-20251001',
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

Use `transformRequestOptions` for server-owned provider settings such as token limits, service tiers, or a server-side system instruction.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

};

````

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
````

</div>

<div backend="fastify">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
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
    const stream = HashbrownAnthropic.stream.text({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownAnthropic.stream.text({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
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

## Extended Thinking

Enable provider-owned reasoning settings with `transformRequestOptions`. Hashbrown emits Claude thinking and redacted thinking as AG-UI reasoning events and preserves their signatures for subsequent requests.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: 1024 },
  }),
});
```

## Transform Request Options

Use `transformRequestOptions` for server-owned provider settings such as token limits, service tiers, or a server-side system instruction.

```ts
const stream = HashbrownAnthropic.stream.text({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)
