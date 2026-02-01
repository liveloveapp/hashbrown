---
title: 'Google Gemini: Hashbrown React Docs'
meta:
  - name: description
    content: 'Hashbrown’s Google Gemini adapter lets you stream chat completions from Google Gemini models, handling function calls, response schemas, and request transforms.'
---

# Google Gemini

First, install the Google adapter package:

```sh
npm install @hashbrownai/google
```

## Streaming Text Responses

Hashbrown’s Google Gemini adapter lets you **stream chat completions** from Google Gemini models, handling function calls, response schemas, and request transforms.

### API Reference

#### `HashbrownGoogle.stream.text(options)`

Streams a Gemini chat completion as a series of encoded frames. Handles content, tool calls, and errors, and yields each frame as a `Uint8Array`.

**Options:**

| Name                      | Type                                    | Description                                                                    |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `apiKey`                  | `string`                                | Your Google Gemini API Key.                                                    |
| `request`                 | `Chat.Api.CompletionCreateParams`       | The chat request: model, messages, tools, system, responseFormat, etc.         |
| `transformRequestOptions` | `(params) => params \| Promise<params>` | _(Optional)_ Transform or override the final Gemini request before it is sent. |

**Supported Features:**

- **Roles:** `user`, `assistant`, `tool`, `error`
- **Tools:** Supports tool calling with OpenAPI schemas automatically converted to Gemini format.
- **Response Format:** Optionally specify a JSON schema for model output validation.
- **System Prompt:** Included as Gemini’s `systemInstruction`.
- **Tool Calling:** Handles Gemini’s tool calling modes and emits tool call frames.
- **Streaming:** Each chunk/frame is encoded using `@hashbrownai/core`’s `encodeFrame`.

### How It Works

- **Messages** are mapped to Gemini's `Content` objects, including tool calls and tool responses.
- **Tools/Functions:** Tools are converted to Gemini `FunctionDeclaration` format, including parameter schema conversion via OpenAPI.
- **Response Schema:** If you specify `responseFormat`, it's converted and set as `responseSchema` for Gemini.
- **Streaming:** All data is sent as a stream of encoded frames (`Uint8Array`). Chunks may contain text, tool calls, errors, or finish signals.
- **Error Handling:** Any thrown errors are sent as error frames before the stream ends.

### Example: Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownGoogle } from '@hashbrownai/google';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
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
import { HashbrownGoogle } from '@hashbrownai/google';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Response } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Res() res: Response) {
    const stream = HashbrownGoogle.stream.text({
      apiKey: process.env.GOOGLE_API_KEY!,
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();

  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
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

---

### Transform Request Options

The `transformRequestOptions` parameter allows you to intercept and modify the request before it's sent to Google Gemini. This is useful for server-side prompts, message filtering, logging, and dynamic configuration.

<hb-backend-code-example>

<div backend="express">

```ts
import { HashbrownGoogle } from '@hashbrownai/google';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    request: req.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add system instructions for Gemini
        systemInstruction: {
          parts: [{ text: 'You are a helpful AI assistant.' }],
        },
        // Adjust generation config
        generationConfig: {
          ...options.generationConfig,
          temperature: getUserPreferences(req.user.id).creativity,
        },
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
import { HashbrownGoogle } from '@hashbrownai/google';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/chat', async (request, reply) => {
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    request: request.body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add system instructions for Gemini
        systemInstruction: {
          parts: [{ text: 'You are a helpful AI assistant.' }],
        },
        // Adjust generation config
        generationConfig: {
          ...options.generationConfig,
          temperature: getUserPreferences(request.user.id).creativity,
        },
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Response, Request } from 'express';

@Controller()
export class ChatController {
  @Post('chat')
  async chat(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const stream = HashbrownGoogle.stream.text({
      apiKey: process.env.GOOGLE_API_KEY!,
      request: body,
      transformRequestOptions: (options) => {
        return {
          ...options,
          // Add system instructions for Gemini
          systemInstruction: {
            parts: [{ text: 'You are a helpful AI assistant.' }],
          },
          // Adjust generation config
          generationConfig: {
            ...options.generationConfig,
            temperature: getUserPreferences(req.user.id).creativity,
          },
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
import { HashbrownGoogle } from '@hashbrownai/google';
import { Hono } from 'hono';

const app = new Hono();

app.post('/chat', async (c) => {
  const body = await c.req.json();

  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    request: body,
    transformRequestOptions: (options) => {
      return {
        ...options,
        // Add system instructions for Gemini
        systemInstruction: {
          parts: [{ text: 'You are a helpful AI assistant.' }],
        },
        // Adjust generation config
        generationConfig: {
          ...options.generationConfig,
          temperature: getUserPreferences(c.req.user.id).creativity,
        },
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
    },
  );
});
```

</div>

</hb-backend-code-example>

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

[Learn more about transformRequestOptions](/docs/react/concept/transform-request-options)

---

### Advanced: Tools and Response Schema

- **Tools:** Add tools using OpenAI-style function specs. They will be auto-converted for Gemini.
- **Tool Calling:** Supported via Gemini's tool configuration, with control over `auto`, `required`, or `none` modes.
- **Response Format:** Pass a JSON schema in `responseFormat` for structured output.
