---
title: 'OpenAI: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s OpenAI adapter maps AG-UI runs to the OpenAI Responses API, with reasoning, and streams canonical AG-UI events.'
---

# OpenAI

<hb-docs-demo demo="canonical-workbench-first-plan-angular">
</hb-docs-demo>

Connect your application's chat endpoint to OpenAI's Responses API. The browser sends conversation history and feature contracts as AG-UI input. Our server chooses the model, holds the key, and maps the provider's stream back to AG-UI events. This lets the same Angular screen use text, tools, and structured output through one endpoint.

The teaser follows the real OpenAI-backed client flow. The server integration below is the reusable part; the inspector and timeline belong to the workbench.

<hb-diagram diagram="request-boundary">
</hb-diagram>

## Install the server adapter

Install the OpenAI adapter, the official OpenAI SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/openai openai @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownOpenAI.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses OpenAI's streaming Responses API. Encode its events as AG-UI SSE at your HTTP boundary.

The model is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                                | OpenAI API key.                                                                                            |
| `baseURL`                 | `string`                                | _(Optional)_ Base URL of a server that implements the Responses API.                                       |
| `model`                   | `string`                                | Server-selected OpenAI model.                                                                              |
| `input`                   | `OpenAIHashbrownRunAgentInput`          | AG-UI run input, including messages and tools.                                                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the OpenAI request when the HTTP client disconnects.                                  |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `reasoning`               | `false \| { effort?, summary? }`        | _(Optional)_ Controls the `reasoning` request parameter. See [Reasoning](#reasoning).                      |
| `builtInTools`            | `OpenAIBuiltInTools`                    | _(Optional)_ Turns on provider-run tools. See [Built-in Tools](#built-in-tools).                           |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final streaming Responses request (`ResponseCreateParamsStreaming`).           |

The adapter maps system and developer instructions, message history, tool definitions, and tool results. Text and tool calls become canonical AG-UI events. Provider and mapping failures are emitted as `RUN_ERROR` events.

### Responses API

The adapter streams from OpenAI's Responses API. Every request sends `store: false`, so OpenAI does not keep conversation state for you. Hashbrown replays the earlier turns, including earlier reasoning, from the history your client sends, which also works with zero-data-retention organizations.

`baseURL` must point at a server that implements the Responses API. Servers that only implement Chat Completions (for example vLLM, OpenRouter, or LM Studio, depending on the server and mode) are no longer supported by `@hashbrownai/openai`.

### Reasoning

Reasoning models, which are models whose names start with `o` and a digit (`o3`), `gpt-5`, or `gpt-` followed by a major version of 5 or later, stream reasoning summaries by default. `-chat` variants such as `gpt-5-chat-latest` are not reasoning models. Hashbrown sends `reasoning: { summary: 'auto' }` and `include: ['reasoning.encrypted_content']` for them, and leaves `effort` to the model. Other models get no `reasoning` field.

Use the `reasoning` option to change this:

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-5',
  input,
  reasoning: { effort: 'low', summary: 'detailed' },
});
```

- `reasoning: { effort, summary }` is sent as given. A missing `summary` defaults to `'auto'`. `effort` is sent only when you set it.
- `reasoning: false` stops Hashbrown from requesting reasoning summaries. It does not turn reasoning off: a reasoning model may still return encrypted reasoning, which Hashbrown still replays on the next turn.

The client receives reasoning as AG-UI `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, and `REASONING_MESSAGE_END` events for the summary text, and `REASONING_ENCRYPTED_VALUE` events for the encrypted content. On the Hashbrown side, assistant messages expose them as `reasoning` and `reasoningDetails`.

### Structured Output

Set `input.forwardedProps.hashbrown.responseSchema` to use OpenAI native JSON schema output:

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

<hb-diagram diagram="direct-provider-request-boundary">
</hb-diagram>

The examples below host `/run` in an ordinary application. Configure your Angular client to call that route, using the [Quickstart](/docs/angular/start/quick) for the framework setup. They show provider mapping, SSE encoding, and disconnect cancellation. Add your application's validation, identity, authorization, and request limits before exposing the route; see [Securing a public endpoint](/docs/angular/recipes/public-endpoint). A TypeScript assertion on the request body does not validate it.

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
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
import { HashbrownOpenAI } from '@hashbrownai/openai';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
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
import { HashbrownOpenAI } from '@hashbrownai/openai';
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
    const stream = HashbrownOpenAI.stream.text({
      apiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
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
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
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

## Built-in Tools

Built-in tools run on the model provider instead of in your app or on your server. Turn them on with `builtInTools`. The keys are the camelCase form of the `builtin` value a call reports, so a key means the same capability on every Hashbrown provider adapter. The available keys are `webSearch` and `codeExecution`.

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4.1-mini',
  input,
  signal,
  builtInTools: { webSearch: true },
});
```

Pass `true` for the provider defaults, or the tool's own configuration (for example `search_context_size`, `user_location` or `filters`), which is sent unchanged: `builtInTools: { webSearch: { search_context_size: 'low' } }`. Web search needs a model that supports the Responses API `web_search` tool.

On the client, each search arrives as an entry in the assistant message's `serverToolCalls`, with `kind: 'provider'` and `builtin: 'web_search'`. Hashbrown never runs it, and a client tool with the same name is never called in its place. The entry carries a ready-to-show `label` (for example `Searched 'hashbrown ai' · 3 sources`), the `queries` it ran, the `sources` it found, and its `outcome`. A failed search settles as `complete` with `outcome: 'failure'` and an `error`. See [Server-Executed Tool Calls](/docs/angular/concept/functions#server-executed-tool-calls) for every field.

The answer's `url_citation` annotations become `citations` on the assistant message. Each citation's `sourceId` is the `id` of a source, and `quote` holds the cited text. A citation's source can be on the call or on the message: in the `sources` of one of the message's `serverToolCalls`, or, when no search returned it, in the message's own `sources`. Look in both.

```ts
@Component({
  selector: 'app-answer',
  template: `
    @for (call of message().serverToolCalls ?? []; track call.toolCallId) {
      <p>{{ call.label }}</p>
    }
    @for (citation of message().citations ?? []; track $index) {
      @if (hrefFor(citation.sourceId); as href) {
        <a [href]="href">{{ citation.quote ?? href }}</a>
      }
    }
  `,
})
export class AnswerComponent {
  readonly message = input.required<UiAssistantMessage>();

  hrefFor(sourceId: string): string | undefined {
    const message = this.message();
    return [
      ...(message.serverToolCalls ?? []).flatMap((call) => call.sources ?? []),
      ...(message.sources ?? []),
    ].find((source) => source.id === sourceId)?.href;
  }
}
```

OpenAI requires inline citations to be clearly visible and clickable wherever your UI shows the answer. Source links may carry `?utm_source=openai`; keep it.

Web search source lists need the `builtInTools.webSearch` option, because it also requests `web_search_call.action.sources`. A `web_search` tool you add through `transformRequestOptions` instead still streams as a provider tool call, with a label and queries, but without sources.

## Code Execution

Enable the provider's Code Interpreter with `builtInTools.codeExecution`. Pass `true` for `{ type: 'code_interpreter', container: { type: 'auto' } }`. Hashbrown also requests `code_interpreter_call.outputs`, alongside any reasoning or web search includes.

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-5',
  input,
  signal,
  builtInTools: { codeExecution: true },
});
```

For native configuration, pass the tool's options without `type`. The adapter clones the configuration before building the request. For example, an automatic container can receive provider file IDs and a memory limit:

```ts
import type { OpenAIBuiltInTools } from '@hashbrownai/openai';

const builtInTools: OpenAIBuiltInTools = {
  codeExecution: {
    container: {
      type: 'auto',
      file_ids: ['file-input'],
      memory_limit: '4g',
    },
  },
};
```

To use an existing provider container, pass its ID instead:

```ts
const builtInTools: OpenAIBuiltInTools = {
  codeExecution: { container: 'cntr-existing' },
};
```

The model must support Code Interpreter; unsupported requests fail through the normal provider error path. You can combine code execution with `webSearch`, application tools, reasoning and structured output.

Each execution appears in the assistant message's `serverToolCalls` with `name: 'code_interpreter'`, `kind: 'provider'`, `builtin: 'code_execution'`, an `icon` of `run` and a ready-to-show `label`. A registered app tool with the same name remains separate. While code arguments stream, the call has `status: 'inProgress'`; once arguments finish, it has `status: 'executing'` until a native execution result arrives. Arguments ending does not mean execution succeeded.

A completed native execution settles as `status: 'complete'` with `outcome: 'success'`. Native failed or incomplete executions settle with `outcome: 'failure'`, a readable `error` and a rejected public `result`. Successful `result.value` contains the serialized native result, including `code`, `container_id`, `status` and `outputs` (logs or image values). Native `code: null` means the provider did not supply code. Image outputs with a real URL can also appear in the call's `sources`.

Generated-file annotations belong to the assistant answer. Find a citation's source by matching `citation.sourceId` to `source.id` across the message's own `sources` and its calls' `sources`. A file source has `kind: 'file'`, `fileId`, a `title` and, when supplied, `containerId`. Hashbrown does not invent a download URL or attach an answer file to a guessed execution. Character positions and quotes are optional: invalid spans, ambiguous Unicode offsets and noncontiguous text parts retain their source references without fabricated positions.

Your server owns file retrieval and storage. Use the native file/container IDs with the provider's file APIs, applying your app's access checks, and provide your own download route if needed. Containers and files remain provider-owned and ephemeral.

Every request uses `store: false`. Hashbrown omits provider execution display calls and their synthetic results from later requests, while preserving ordinary application calls and results. The earlier native execution context is therefore absent: automatic container reuse across turns is not promised. When your application needs retained container state, keep the returned container ID and supply it explicitly through `codeExecution.container` on the next run.

## Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/angular/concept/activities) for how the client renders them.

```ts
import { HashbrownOpenAI } from '@hashbrownai/openai';

const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-5-nano',
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
const stream = HashbrownOpenAI.stream.text({
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.OPENAI_MODEL ?? 'gpt-5-nano',
  input,
  transformRequestOptions: (options) => ({
    ...options,
    max_output_tokens: 2048,
  }),
});
```

[Learn more about transformRequestOptions](/docs/angular/concept/transform-request-options)

## Explore it in the workbench

Start the [conversation workbench](/docs/angular/start/workbench) and open `/angular.html?lesson=first-plan`. Ask for a two-step plan. In **Requests**, compare the AG-UI input with the streamed response; in **UI**, follow the resolved props into the trusted card. **State** stays unchanged because this lesson previews a plan without accepting it.

The workbench's [server route](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts) adds bounded lesson policy around an OpenAI adapter. Compare that route with the `OpenAI` route above: the client contract stays AG-UI, while authentication, native request options, and capability support belong to the selected provider. This is the same provider path shown in the teaser.
