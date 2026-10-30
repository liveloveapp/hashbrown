---
title: 'Google Gemini: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Google Gemini adapter maps AG-UI runs to the Google Gen AI SDK and streams canonical AG-UI events.'
---

# Google Gemini

<hb-docs-demo demo="canonical-workbench-first-plan-react">
</hb-docs-demo>

Connect Hashbrown to Gemini through the Developer API or Vertex AI. Both paths accept the same AG-UI conversation input, but authentication and some native tool capabilities differ. Choose that server boundary first, then expose one streaming endpoint to the browser.

The teaser demonstrates the OpenAI-backed client flow. It does not demonstrate Gemini, Vertex AI, or Google grounding.

<hb-diagram diagram="request-boundary">
</hb-diagram>

## Install the server adapter

Install the Google adapter, the Google Gen AI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/google @google/genai @ag-ui/encoder
```

## Authentication

The adapter supports two mutually exclusive authentication modes. The model is server configuration and is not read from the client run input.

**Gemini Developer API:**

```ts
HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.5-flash',
  input,
});
```

**Vertex AI with Application Default Credentials:**

```ts
HashbrownGoogle.stream.text({
  vertexai: true,
  project: 'your-gcp-project',
  location: 'us-central1',
  model: 'gemini-2.5-flash',
  input,
});
```

## Streaming Text Responses

`HashbrownGoogle.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. Encode those events as AG-UI SSE at your HTTP boundary.

### API Reference

| Name                      | Type                                                      | Description                                                                                                |
| ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                                  | Gemini Developer API key. Mutually exclusive with `vertexai`.                                              |
| `vertexai`                | `true`                                                    | Enables Vertex AI. Mutually exclusive with `apiKey`.                                                       |
| `project`                 | `string`                                                  | GCP project ID. Required with `vertexai: true`.                                                            |
| `location`                | `string`                                                  | GCP region. Required with `vertexai: true`.                                                                |
| `model`                   | `string`                                                  | Server-selected Google model.                                                                              |
| `input`                   | `GoogleHashbrownRunAgentInput`                            | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                                             | _(Optional)_ Cancels the Google request when the HTTP client disconnects.                                  |
| `activities`              | `ActivityCallback`                                        | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `builtInTools`            | `GoogleDeveloperBuiltInTools \| GoogleVertexBuiltInTools` | _(Optional)_ Enables Google search, URL context and code execution. See [Built-in Tools](#built-in-tools). |
| `transformRequestOptions` | `(params) => params \| Promise<params>`                   | _(Optional)_ Transforms the final Google `GenerateContentParameters`.                                      |

The adapter maps system instructions, message history, tool definitions, tool results, and native structured output. Gemini thought parts become AG-UI reasoning records, and Gemini thought signatures are preserved for continuation. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.forwardedProps.hashbrown.responseSchema` to use Gemini's native JSON schema output:

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

<hb-diagram diagram="direct-provider-request-boundary">
</hb-diagram>

The examples below host `/run` in an ordinary application. Configure your React client to call that route, using the [Quickstart](/docs/react/start/quick) for the framework setup. They show provider mapping, SSE encoding, and disconnect cancellation. Add your application's validation, identity, authorization, and request limits before exposing the route; see [Securing a public endpoint](/docs/react/recipes/public-endpoint). A TypeScript assertion on the request body does not validate it.

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownGoogle } from '@hashbrownai/google';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
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
    const stream = HashbrownGoogle.stream.text({
      apiKey: process.env.GOOGLE_API_KEY!,
      model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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

### Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/react/concept/activities) for how the client renders them.

```ts
import { HashbrownGoogle } from '@hashbrownai/google';

const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.5-flash',
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

`transformRequestOptions` receives the Google SDK request after AG-UI input has been mapped. Use it for server-owned provider settings. When adding built-ins in this hook, supply their required tool configuration too: Developer native circulation needs `includeServerSideToolInvocations`, with `VALIDATED` mode for mixed application tools. The `builtInTools` option supplies that configuration automatically. Final transformed requests are checked for backend compatibility.

```ts
const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    config: {
      ...options.config,
      temperature: 0.2,
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
    },
  }),
});
```

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

## Built-in Tools

Enable Google's server tools with `builtInTools`:

```ts
const stream = HashbrownGoogle.stream.text({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: process.env.GOOGLE_MODEL!,
  input,
  builtInTools: {
    webSearch: true,
    webFetch: true,
    codeExecution: true,
  },
});
```

`true` uses an empty native configuration: `googleSearch`, `urlContext`, or
`codeExecution`. Pass a native configuration object to customize a tool. The adapter
retains supported object settings. Choose a model that supports the selected tools
and their combination with application functions.

The Developer API enables native tool context circulation. When application tools
are mixed with built-ins, the adapter uses `VALIDATED` function-calling mode.
App-only requests retain `AUTO`. Developer search configuration supports
`timeRangeFilter`; Vertex search supports `excludeDomains` and `blockingConfidence`.
The exported `GoogleDeveloperBuiltInTools` and `GoogleVertexBuiltInTools` types
reflect these backend differences. Final transformed requests are checked before
calling the SDK.

Search, URL context, and code execution expose real provider calls in
`serverToolCalls` when the API supplies invocations. Calls receive labels, timing,
source links and outcomes; code failures retain readable native output. They execute
at Google and never dispatch to a same-named application tool. Vertex supports
search/URL grounding and native code execution, but the installed SDK does not
support Developer-native `toolCall`/`toolResponse` parts or their circulation flag on
Vertex. Grounding without an invocation appears as answer sources and citations.

### Search Sources and Attribution

Assistant messages expose `sources`, `citations`, and `attribution`. Citations link
to source IDs, with source text retained as a quote. Native byte offsets are not
presented as offsets into the joined answer text.

When Google supplies Search Suggestions, the attribution contains
`provider: 'google'`, `kind: 'search-suggestions'`, the original HTML, and
`mustRender: true`. Applications must display that HTML unchanged next to the answer,
at full width, without restyling or link tracking. Hashbrown preserves the content
and display obligation; your application renders it. See [Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search).

### Native Conversation History

The adapter captures ordered Google Content fragments, including repeated parts,
signed reasoning, server calls/results, code, and trailing empty signed parts.
A `hashbrown.provider-history` CUSTOM footer stores that capture in canonical
message metadata. Keep canonical messages and metadata when persisting a conversation.
Complete captures replay once in their original order; application tool results
remain in their chronological positions.

Histories without captures retain the existing reasoning/function fallback. Provider
calls are filtered from application function replay, and unsafe native continuation
fails with a clear input error. Developer-only native history cannot be replayed to
Vertex. A response containing only grounding metadata is retained as RAW data without
creating a synthetic assistant message.

## Explore it in the workbench

Start the [conversation workbench](/docs/react/start/workbench) and open `/react.html?lesson=first-plan`. Ask for a two-step plan. In **Requests**, compare the AG-UI input with the streamed response; in **UI**, follow the resolved props into the trusted card. **State** stays unchanged because this lesson previews a plan without accepting it.

<hb-workbench-launcher lesson="first-plan">
</hb-workbench-launcher>

The workbench's [server route](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts) adds bounded lesson policy around an OpenAI adapter. Compare that route with the `Google Gemini` route above: the client contract stays AG-UI, while authentication, native request options, and capability support belong to the selected provider. This exercise does not call Google Gemini or verify its provider-specific behavior.
