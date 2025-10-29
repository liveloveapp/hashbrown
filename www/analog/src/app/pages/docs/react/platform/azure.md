---
title: 'Microsoft Azure: Hashbrown React Docs'
meta:
  - name: description
    content: 'First, install the Microsoft Azure adapter package:'
---
# Microsoft Azure

First, install the Microsoft Azure adapter package:

```shell
npm install @hashbrownai/azure
```

## Streaming Text Responses

Hashbrown's Azure adapter lets you **stream chat completions** from Azure OpenAI Service, with support for Azure-specific configuration like endpoints and API versions.

### API Reference

#### `HashbrownAzure.stream.text(options)`

Streams an Azure OpenAI chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your Azure OpenAI API Key.                                                     |
| `endpoint`                | `string`                                | Your Azure OpenAI endpoint URL.                                                |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final Azure request before it is sent.  |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`
- **Tools:** Supports Azure OpenAI tool calling, including `toolCalls` and strict function schemas.
- **Response Format:** Optionally specify a JSON schema for structured output.
- **System Prompt:** Included as the first message if provided.
- **Tool Calling:** Handles Azure OpenAI tool calling modes and emits tool call frames.
- **Streaming:** Each chunk is encoded into a resilient streaming format.

### How It Works

- **Messages:** Translated to Azure OpenAI's message format, supporting all roles and tool calls.
- **Tools/Functions:** Tools are passed as Azure OpenAI function definitions, using your JSON schemas as `parameters`.
- **Response Format:** Pass a JSON schema in `responseFormat` for Azure OpenAI to validate the model output.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownAzure } from '@hashbrownai/azure';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownAzure.stream.text({
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
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
import { HashbrownAzure } from '@hashbrownai/azure';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
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
    }
  );
});

export default app;
```

</div>

</hb-backend-code-example>



---

---

### Transform Request Options

The `transformRequestOptions` parameter allows you to intercept and modify the request before it's sent to Azure OpenAI. This is useful for server-side prompts, message filtering, logging, and dynamic configuration.

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownAzure } from '@hashbrownai/azure';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust temperature based on user preferences
        temperature: getUserPreferences(req.user.id).creativity,
      };
    },
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

</div>

<div backend="fastify">

```ts
import { HashbrownAzure } from '@hashbrownai/azure';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    request: request.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust temperature based on user preferences
        temperature: getUserPreferences(request.user.id).creativity,
      };
    },
  });

  reply.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    reply.raw.write(chunk);
  }

  reply.raw.end();
});
```

</div>

<div backend="nestjs">

```ts
import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import { HashbrownAzure } from '@hashbrownai/azure';
import { Response, Request } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const stream = HashbrownAzure.stream.text({
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      request: body,
      transformRequestOptions: (options) => {
        return {
          ...options,
          // Add server-side system prompt
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...options.messages,
          ],
          // Adjust temperature based on user preferences
          temperature: getUserPreferences(req.user.id).creativity,
        };
      },
    });

    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of stream) {
      res.write(chunk);
    }

    res.end();
  }
}
```

</div>

<div backend="hono">

```ts
import { HashbrownAzure } from '@hashbrownai/azure';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();
  
  const stream = HashbrownAzure.stream.text({
    apiKey: process.env.AZURE_API_KEY!,
    endpoint: process.env.AZURE_ENDPOINT!,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add server-side system prompt
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...options.messages,
        ],
        // Adjust temperature based on user preferences
        temperature: getUserPreferences(c.req.user.id).creativity,
      };
    },
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    }
  );
});
```

</div>

</hb-backend-code-example>

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

---

## Model Versions

Azure requires model versions to be supplied when making a request. To do this, specify the model version in the `model` string when using any React Hashbrown hook or resource:

```ts
import { useCompletion } from '@hashbrownai/react';

const { output, isReceiving } = useCompletion({
  model: 'gpt-4.1@2025-01-01-preview',
  input: 'Hello, world!',
  system: 'You are a helpful assistant.',
});
```
