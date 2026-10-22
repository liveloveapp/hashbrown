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
| `fetch`            | `typeof fetch`    | _(Optional)_ A `fetch` implementation. Defaults to the global `fetch`.         |
| `maxRequestChars`  | `number`          | _(Optional)_ The largest request accepted, in characters of JSON.              |

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

For UI selection, build the schema with `createSelectionSchema` from the same list the browser decides over: the candidates, or the chat's components and UI kits. See [UI Selection](/docs/angular/recipes/ui-selection).

To call `decide` from inside an agent and get typed answers with `decodeDecision`, see [Decisions in Agents](/docs/angular/recipes/decisions-in-agents).

The schema is your code, so it is checked when you call `decide`. An invalid schema (for example an unbounded score) rejects with the `DecisionSchemaError` from `@hashbrownai/core`, not a `DecisionError`. Treat it as a server error and don't send its details to the client.

Without a `schema`, the request is validated before any network call: question shapes, at most 255 options per choice, and 2 to 10 score levels.

Every request is capped at 256,000 characters of JSON, about Jev's 64k-token limit, or 1,048,000 characters when it sets `options.longContext`. Pass `maxRequestChars` to set a lower cap for a public endpoint.

## Vercel AI Gateway

Point `baseURL` at the Gateway and use your Gateway key or a Vercel OIDC token. Nothing else changes. The Gateway serves requests only once your Vercel team has a credit card on file. Until then it answers HTTP 403, which surfaces as an `unauthorized` error whose message includes `customer_verification_required`.

```ts
await HashbrownTypeSafe.decide({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: 'https://ai-gateway.vercel.sh/typesafe',
  model: 'jev-1.14.0',
  request,
});
```

## Errors

Every failure caused by the client's request, TypeSafe, or the network throws a `DecisionError` with a `code` and an HTTP `status`. A few things reject with something else:

- An aborted `signal` rejects with the signal's reason.
- An invalid server `schema` rejects with `DecisionSchemaError`.
- Anything thrown by `transformRequest` propagates unchanged.

The last two are server programming errors. Let them reach your error handler as HTTP 500, as the examples above do by rethrowing.

| Code               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| `invalid_request`  | The client's request is not valid.                     |
| `unauthorized`     | TypeSafe or the Gateway refused the request (401/403). |
| `rate_limited`     | TypeSafe is rate limiting. Retried twice before this.  |
| `upstream`         | TypeSafe or the network failed.                        |
| `invalid_response` | TypeSafe answered with something unexpected.           |

For HTTP errors, the message includes the status and the vendor's own error type and message, such as `TypeSafe responded with status 403 (customer_verification_required): …`. Log it on the server. Send clients only the `code` and `status`.

Responses with HTTP 429 or 529 are retried up to twice.

## Transform Request

`transformRequest` receives the native TypeSafe request body just before it is sent. Use it for server-owned settings. Anything it throws propagates unchanged.

## Long Context

When the client sends `options: { longContext: true }`, the adapter adds TypeSafe's `TypeSafe-Danger-Zone-Long-Context: true` header. That raises the request and per-question context limits to 262k tokens. Long context is slower and less accurate, so enable it only for requests that need it. See [TypeSafe models](https://docs.typesafe.ai/models.md).

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
