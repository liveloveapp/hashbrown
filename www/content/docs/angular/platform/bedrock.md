---
title: 'Amazon Bedrock: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s Amazon Bedrock adapter maps AG-UI runs to the AWS Bedrock Converse API and streams canonical AG-UI events.'
---

# Amazon Bedrock

<hb-docs-demo demo="canonical-workbench-first-plan-angular">
</hb-docs-demo>

Use Amazon Bedrock when the model or inference profile belongs to your AWS environment. The adapter maps AG-UI input to ConverseStream and maps native responses back to the events Hashbrown consumes. AWS credentials, region, and model access stay with the server; the browser needs only your application's endpoint.

The teaser demonstrates the OpenAI-backed client flow. It does not demonstrate a Bedrock invocation, AWS credentials, or model access.

<hb-concept-diagram concept="client-server">
</hb-concept-diagram>

## Install the server adapter

Install the Bedrock adapter, the AWS Bedrock Runtime SDK, and the AG-UI SSE encoder:

```sh
npm install @hashbrownai/bedrock @aws-sdk/client-bedrock-runtime @ag-ui/core @ag-ui/encoder
```

## Streaming Text Responses

`HashbrownBedrock.stream.text(options)` accepts an AG-UI `RunAgentInput` and returns an `AsyncIterable<AGUIEvent>`. The adapter uses the AWS SDK's `ConverseStream` API. Encode its events as AG-UI SSE at your HTTP boundary.

The model or inference profile is server configuration and is not read from the client run input.

### API Reference

| Name                      | Type                                    | Description                                                                                                |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `model`                   | `string`                                | Server-selected Bedrock model or inference profile ID.                                                     |
| `input`                   | `BedrockHashbrownRunAgentInput`         | AG-UI run input, including messages and tools.                                                             |
| `clientOptions`           | `BedrockRuntimeClientConfig`            | _(Optional)_ AWS SDK client configuration. Mutually exclusive with `client`.                               |
| `client`                  | `BedrockRuntimeClient`                  | _(Optional)_ Reusable AWS SDK client. Mutually exclusive with `clientOptions`.                             |
| `signal`                  | `AbortSignal`                           | _(Optional)_ Cancels the Bedrock request when the HTTP client disconnects.                                 |
| `activities`              | `ActivityCallback`                      | _(Optional)_ Sends activities alongside the model's output. See [Sending Activities](#sending-activities). |
| `builtInTools`            | `BedrockBuiltInTools`                   | _(Optional)_ Enables Nova web grounding with `webSearch`.                                                  |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transforms the final Bedrock `ConverseStreamCommandInput`.                                    |

The adapter maps system and developer instructions, message history, tools, tool results, and native structured output. Bedrock reasoning text, signatures, and redacted reasoning become AG-UI reasoning records that can be sent back on continuation. Native server tools become provider steps, and grounding citations become answer sources and citations. Images, response metadata, and unsupported native blocks remain available as AG-UI `RAW` events. Provider and mapping failures are emitted as `RUN_ERROR` events.

Set `input.forwardedProps.hashbrown.responseSchema` to use Bedrock native structured output on a model that supports it:

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

The examples below host `/run` in an ordinary application. Configure your Angular client to call that route, using the [Quickstart](/docs/angular/start/quick) for the framework setup. They show provider mapping, SSE encoding, and disconnect cancellation. Add your application's validation, identity, authorization, and request limits before exposing the route; see [Securing a public endpoint](/docs/angular/recipes/public-endpoint). A TypeScript assertion on the request body does not validate it.

<hb-backend-code-example>

<div backend="express">

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/run', async (request, reply) => {
  const abortController = new AbortController();
  request.raw.once('aborted', () => abortController.abort());
  reply.raw.once('close', () => abortController.abort());
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
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
    const stream = HashbrownBedrock.stream.text({
      clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
      model: process.env.BEDROCK_MODEL_ID!,
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
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import { Hono } from 'hono';

const app = new Hono();

app.post('/run', async (c) => {
  const input = (await c.req.json()) as RunAgentInput;
  const stream = HashbrownBedrock.stream.text({
    clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
    model: process.env.BEDROCK_MODEL_ID!,
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

Enable Nova web grounding with `builtInTools.webSearch`:

```ts
const stream = HashbrownBedrock.stream.text({
  clientOptions: { region: 'us-east-1' },
  model: process.env.BEDROCK_MODEL_ID!,
  input,
  builtInTools: { webSearch: true },
});
```

`true` adds `{ systemTool: { name: 'nova_grounding' } }` alongside application
tools. The exported `BedrockBuiltInTools` type also accepts a native configuration
object; the installed SDK currently has no search settings beyond the fixed tool
name. Choose a Nova model and region that support grounding and grant the required
Bedrock tool permissions. See [AWS Nova web grounding](https://docs.aws.amazon.com/nova/latest/nova2-userguide/web-grounding.html).

When Bedrock supplies a native `server_tool_use`, the adapter exposes it in
`serverToolCalls` with its running state, label and timing. Its native result
supplies the outcome and readable output. A matching application tool name does
not change ownership: ordinary app calls still dispatch to your application.
Closing an invocation or ending a run does not imply the provider tool succeeded.

The public Bedrock code-execution enabling option and file search remain deferred.
A native `nova_code_interpreter` call enabled through `transformRequestOptions`
still becomes a provider step. Native errors and interpreter failures retain
readable result content; application tool results remain separate.

### Grounding Citations

Assistant messages expose grounding through `sources` and `citations`, including
responses where Nova supplies citations without announcing a tool invocation.
Those responses do not create a synthetic tool call. Sources proven to come from
a native tool result live on that tool's step; other grounding sources live on
the answer. Citation source IDs link to either collection.

Applications must retain and display Nova's returned citations and source links.
Hashbrown is headless: your application renders those links. Citation quotes
preserve available source text. Native document character, page, chunk and search
result locations are source coordinates, so they are preserved for native replay
and are not presented as answer-text offsets.

### Native Conversation History

The adapter stores ordered native assistant blocks in a
`hashbrown.provider-history` CUSTOM footer on canonical message metadata. Preserve
canonical messages and metadata when persisting history. Complete captures replay
once in their original order, including server calls and results, interleaved
text, citations, signed reasoning, and redacted bytes. Application tool results
remain user-role results at their original chronological positions.

Only a normally completed response with a native message stop and closed content
blocks receives a usable complete capture. Aborted or truncated native responses
cannot safely resume from an invented reconstruction. Legacy text, client-tool
and supported reasoning histories retain their existing replay path; unsafe
provider-native history without a complete capture fails with an input error.

Existing integration recordings cover app-tool and streaming regressions. The
current recorder does not preserve the native system-tool, server-result and
citation protocol faithfully; deterministic SDK-shaped tests cover those paths.

## AWS Credentials and Client Reuse

`clientOptions` uses the AWS SDK default credential provider chain, including environment variables, shared AWS config, ECS task roles, EC2 instance roles, and web identity credentials.

```ts
const stream = HashbrownBedrock.stream.text({
  clientOptions: {
    region: 'us-east-1',
  },
  model: process.env.BEDROCK_MODEL_ID!,
  input,
});
```

Pass a configured `BedrockRuntimeClient` through `client` when you need to reuse connections, retries, or middleware. Hashbrown destroys clients it creates from `clientOptions`; it never destroys a client supplied through `client`.

## Sending Activities

Pass `activities` to send AG-UI activities alongside the model's output. Activities are display-only progress, such as a plan or a progress report, and the model never sees them. See [Activities](/docs/angular/concept/activities) for how the client renders them.

```ts
import { HashbrownBedrock } from '@hashbrownai/bedrock';

const stream = HashbrownBedrock.stream.text({
  clientOptions: { region: process.env.AWS_REGION ?? 'us-east-1' },
  model: process.env.BEDROCK_MODEL_ID!,
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

Use `transformRequestOptions` for provider-owned inference settings, guardrails, request metadata, performance configuration, or a forced tool choice.

```ts
const stream = HashbrownBedrock.stream.text({
  clientOptions: { region: 'us-east-1' },
  model: process.env.BEDROCK_MODEL_ID!,
  input,
  transformRequestOptions: (options) => ({
    ...options,
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.2,
    },
    requestMetadata: {
      application: 'my-app',
    },
  }),
});
```

## Explore it in the workbench

Start the [conversation workbench](/docs/angular/start/workbench) and open `/angular.html?lesson=first-plan`. Ask for a two-step plan. In **Requests**, compare the AG-UI input with the streamed response; in **UI**, follow the resolved props into the trusted card. **State** stays unchanged because this lesson previews a plan without accepting it.

The workbench's [server route](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts) adds bounded lesson policy around an OpenAI adapter. Compare that route with the `Amazon Bedrock` route above: the client contract stays AG-UI, while authentication, native request options, and capability support belong to the selected provider. This exercise does not call Amazon Bedrock or verify its provider-specific behavior.
