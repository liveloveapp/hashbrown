---
title: 'TypeSafe: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Hashbrown’s TypeSafe adapter answers decision requests with the Jev decision model.'
---

# TypeSafe

<p class="subtitle">Answer Hashbrown decision requests with TypeSafe's Jev model.</p>

Install the adapter. It uses the global `fetch`, so it needs no other dependency:

```sh
npm install @hashbrownai/typesafe @hashbrownai/core
```

Keep your `TYPESAFE_API_KEY` on the server. The adapter never runs in the browser.

## Answering Decisions

`HashbrownTypeSafe.decide(options)` takes the JSON request your client sent, validates it, calls TypeSafe, and returns the decision response. Return it as JSON from the route your client calls (`/api/decide` by default).

### API Reference

| Name               | Type              | Description                                                                    |
| ------------------ | ----------------- | ------------------------------------------------------------------------------ |
| `apiKey`           | `string`          | Your TypeSafe API key.                                                         |
| `model`            | `string`          | The model version to use. Required. Pin an exact version such as `jev-1.14.0`. |
| `request`          | `unknown`         | The decision request from the client. Validated before any network call.       |
| `schema`           | `DecidableSchema` | _(Optional)_ Pins the questions on the server.                                 |
| `baseURL`          | `string`          | _(Optional)_ Defaults to `https://api.typesafe.ai`.                            |
| `signal`           | `AbortSignal`     | _(Optional)_ Cancels the call when the client disconnects.                     |
| `transformRequest` | `(body) => body`  | _(Optional)_ Edits the request body just before it is sent.                    |

### Node.js Server Integration

<hb-backend-code-example>

<div backend="express">

```ts
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/api/decide', async (req, res) => {
  const abortController = new AbortController();
  res.once('close', () => abortController.abort());

  try {
    const decision = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      request: req.body,
      signal: abortController.signal,
    });
    res.json(decision);
  } catch (error) {
    if (error instanceof DecisionError) {
      res
        .status(error.status)
        .json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

app.listen(3000);
```

</div>

<div backend="fastify">

```ts
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/api/decide', async (request, reply) => {
  const abortController = new AbortController();
  reply.raw.once('close', () => abortController.abort());

  try {
    return await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      request: request.body,
      signal: abortController.signal,
    });
  } catch (error) {
    if (error instanceof DecisionError) {
      return reply
        .status(error.status)
        .send({ code: error.code, message: error.message });
    }
    throw error;
  }
});

fastify.listen({ port: 3000 });
```

</div>

<div backend="hono">

```ts
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { Hono } from 'hono';

const app = new Hono();

app.post('/api/decide', async (c) => {
  try {
    const decision = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      request: await c.req.json(),
      signal: c.req.raw.signal,
    });
    return c.json(decision);
  } catch (error) {
    if (error instanceof DecisionError) {
      return c.json(
        { code: error.code, message: error.message },
        error.status as 400,
      );
    }
    throw error;
  }
});

export default app;
```

</div>

</hb-backend-code-example>

### Next.js App Router

```ts
// app/api/decide/route.ts
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';

export async function POST(req: Request) {
  try {
    const decision = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      request: await req.json(),
      signal: req.signal,
    });
    return Response.json(decision);
  } catch (error) {
    if (error instanceof DecisionError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
```

## Pin the Model Version

`model` is required. Pin an exact version such as `jev-1.14.0` and bump it on purpose, so a model update never changes your decisions unannounced. Do not use `jev-latest` in production.

## Pin the Questions

By default the client sends the questions. Pass a `schema` to stop clients from asking anything they like. The server compiles its own questions from the schema and ignores the ones in the request.

```ts
import { s } from '@hashbrownai/core';

const schema = s.object('Triage', {
  urgent: s.boolean('Is the message urgent?'),
  team: s.enumeration('Which team should handle it?', {
    billing: 'Payments and invoices',
    technical: 'Bugs and outages',
    other: 'Anything else',
  }),
});

await HashbrownTypeSafe.decide({
  apiKey: process.env.TYPESAFE_API_KEY!,
  model: 'jev-1.14.0',
  schema,
  request,
});
```

Without a `schema`, the request is validated before any network call: question shapes, at most 255 options per choice, 2 to 10 score levels, and at most 64,000 characters of JSON.

## Vercel AI Gateway

Point `baseURL` at the Gateway and use your Gateway key. Nothing else changes.

```ts
await HashbrownTypeSafe.decide({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: 'https://ai-gateway.vercel.sh/typesafe',
  model: 'jev-1.14.0',
  request,
});
```

## Errors

Every failure throws a `DecisionError` with a `code` and an HTTP `status`. An aborted `signal` rejects with the signal's reason instead.

| Code               | Meaning                                               |
| ------------------ | ----------------------------------------------------- |
| `invalid_request`  | The request or schema is not valid.                   |
| `unauthorized`     | TypeSafe rejected the API key.                        |
| `rate_limited`     | TypeSafe is rate limiting. Retried twice before this. |
| `upstream`         | TypeSafe or the network failed.                       |
| `invalid_response` | TypeSafe answered with something unexpected.          |

Responses with HTTP 429 or 529 are retried up to twice.

## Transform Request

`transformRequest` receives the native TypeSafe request body just before it is sent. Use it for server-owned settings.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/decisions">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Decisions</h4>
      <p>Ask typed closed questions with decisionResource.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="recipes/ui-selection">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>UI Selection</h4>
      <p>Choose components with uiDecisionResource.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
