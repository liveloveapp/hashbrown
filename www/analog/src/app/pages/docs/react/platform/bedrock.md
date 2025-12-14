---
title: 'Amazon Bedrock (React): Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Amazon Bedrock adapter lets you stream chat completions from AWS Bedrock models with built-in tool calling and streaming support.'
---
# Amazon Bedrock (React)

First, install the Amazon Bedrock adapter package:

```sh
npm install @hashbrownai/bedrock
```

## Streaming Text Responses

Hashbrown’s Bedrock adapter lets you **stream chat completions** from any AWS Bedrock model (Claude, Mistral, Meta, Llama, etc.) while preserving tool calling semantics and the Hashbrown streaming frame format.

### API Reference

#### `HashbrownBedrock.stream.text(options)`

Streams an Amazon Bedrock chat completion as a series of encoded frames. Handles content, tool calls, errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name          | Type                                                      | Description                                                                                     |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `request`     | `Chat.Api.CompletionCreateParams`                         | The chat request: model (e.g. `anthropic.claude-3-5-sonnet-20241022-v1:0`), messages, tools, etc. |
| `region`      | `string`                                                  | _(Optional)_ AWS region for Bedrock (falls back to the AWS SDK default chain if omitted).       |
| `credentials` | `AwsCredentialIdentity \| Provider<AwsCredentialIdentity>` | _(Optional)_ Explicit AWS credentials if not using the default credential chain.               |
| `client`      | `BedrockRuntimeClient`                                    | _(Optional)_ Pre-configured Bedrock client to reuse connections, retries, or custom middleware. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Converts Hashbrown tools into Bedrock `toolConfig` definitions and streams tool call arguments.
- **System Prompt:** Added as a Bedrock system message when supplied.
- **Tool Calling:** Streams tool call deltas (`toolUse`) and tool results in the same order Hashbrown expects.
- **Streaming:** Emits resilient Hashbrown frames for every text delta, tool call update, finish reason, or error.

### How It Works

- **Messages:** User, assistant, and tool messages are mapped to Bedrock `messages` (tool results become `toolResult` blocks).
- **Tool Configuration:** Tools are sent via `toolConfig` with the JSON schema you pass in `parameters`.
- **Tool Call Streaming:** Bedrock’s `toolUse` events are buffered and emitted as incremental Hashbrown tool call frames.
- **Error Handling:** Any SDK or service error is converted into an error frame before Hashbrown sends `finish`.
- **Structured Output:** Amazon Bedrock does not yet honor JSON schemas directly—use `emulateStructuredOutput` in your React provider to coerce tool responses (see below).

### Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownBedrock.stream.text({
    region: process.env.AWS_REGION ?? 'us-east-1',
    request: req.body, // must be Chat.Api.CompletionCreateParams
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk); // Pipe each encoded frame as it arrives
  }

  res.end();
});

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownBedrock.stream.text({
    region: process.env.AWS_REGION ?? 'us-east-1',
    request: request.body, // must be Chat.Api.CompletionCreateParams
  });

  reply.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    reply.raw.write(chunk); // Pipe each encoded frame as it arrives
  }

  reply.raw.end();
});

fastify.listen({ port: 3000 });
```

</div>

<div backend="nestjs">

```ts
import { Controller, Post, Body, Res } from '@nestjs/common';
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownBedrock.stream.text({
      region: process.env.AWS_REGION ?? 'us-east-1',
      request: body, // must be Chat.Api.CompletionCreateParams
    });

    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of stream) {
      res.write(chunk); // Pipe each encoded frame as it arrives
    }

    res.end();
  }
}
```

</div>

<div backend="hono">

```ts
import { HashbrownBedrock } from '@hashbrownai/bedrock';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();

  const stream = HashbrownBedrock.stream.text({
    region: process.env.AWS_REGION ?? 'us-east-1',
    request: body, // must be Chat.Api.CompletionCreateParams
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk); // Pipe each encoded frame as it arrives
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    },
  );
});

export default app;
```

</div>

</hb-backend-code-example>

---

## AWS Credentials & Client Reuse

The adapter uses the AWS SDK’s [default credential provider chain](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html). Provide credentials via environment variables, IAM roles, or pass them explicitly:

```ts
const stream = HashbrownBedrock.stream.text({
  request,
  region: 'us-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
```

If you already configure retries, logging, or custom middleware on a `BedrockRuntimeClient`, pass it with the `client` option to reuse it.

---

## Structured Output & React Providers

Amazon Bedrock does not currently enforce JSON schemas the way OpenAI or Azure do. Enable `emulateStructuredOutput` to have Hashbrown enforce your schemas client-side:

```tsx
import { HashbrownProvider } from '@hashbrownai/react';

export function App({ children }: { children: React.ReactNode }) {
  return (
    <HashbrownProvider baseUrl="/api/chat" emulateStructuredOutput>
      {children}
    </HashbrownProvider>
  );
}
```

This flag ensures Hashbrown keeps your React components in sync with tool responses even when the provider does not validate the schema.
