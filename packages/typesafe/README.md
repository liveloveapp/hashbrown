# @hashbrownai/typesafe

Server-side adapter that answers Hashbrown decision requests with TypeSafe's Jev model.

## Install

```sh
npm install @hashbrownai/typesafe @hashbrownai/core
```

Keep your `TYPESAFE_API_KEY` on the server. The adapter never runs in the browser.

## Next.js App Router

```ts
// app/api/decide/route.ts
import { HashbrownTypeSafe, DecisionError } from '@hashbrownai/typesafe';

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

## Node `http`

```ts
import { createServer } from 'node:http';
import { HashbrownTypeSafe, DecisionError } from '@hashbrownai/typesafe';

createServer(async (req, res) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  res.setHeader('Content-Type', 'application/json');
  try {
    const decision = await HashbrownTypeSafe.decide({
      apiKey: process.env.TYPESAFE_API_KEY!,
      model: 'jev-1.14.0',
      request: JSON.parse(text),
    });
    res.end(JSON.stringify(decision));
  } catch (error) {
    res.statusCode = error instanceof DecisionError ? error.status : 500;
    res.end(JSON.stringify({ message: (error as Error).message }));
  }
}).listen(3000);
```

## Pin the questions on the server

By default the client sends the questions. To stop clients from asking anything
they like, pass a `schema`; the server compiles its own questions and ignores
the ones in the request:

```ts
import { s } from '@hashbrownai/core';

const schema = s.object('Triage', {
  urgent: s.boolean('Is the message urgent?'),
  team: s.enumeration('Which team should handle it?', ['billing', 'technical']),
});

await HashbrownTypeSafe.decide({ apiKey, model, schema, request });
```

Without a `schema`, requests are validated (question shapes, at most 255 options
per choice, 2 to 10 score levels) before any network call. Every request is
capped at 256,000 characters of JSON (about Jev's 64k-token limit), or 1,048,000
with `options.longContext`; `maxRequestChars` sets a lower cap. Failures throw
`DecisionError` with a `code` and an HTTP `status`; for HTTP errors the message
carries the vendor's error type and message. Requests answered with HTTP 429 or
529 are retried up to twice.

## Vercel AI Gateway

Point `baseURL` at the Gateway; only the host and path prefix change:

```ts
await HashbrownTypeSafe.decide({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  baseURL: 'https://ai-gateway.vercel.sh/typesafe',
  model: 'jev-1.14.0',
  request,
});
```

## Pin the model version

`model` is required. Always pin an exact version such as `jev-1.14.0` and bump it
deliberately, so a model update never changes your decisions unannounced. Do not
use a floating alias in production.

## What this package sends

**When you install.** A postinstall step sends one `package.installed` event:
the package name and version, your operating system, CPU architecture, Node
version, package manager, whether the install ran in CI, and, when Git is
configured in the installing checkout or globally and the install is not in CI,
your Git `user.name`, `user.email`, and the owner of the `origin` remote on
GitHub, GitLab, or Bitbucket. It finishes within five seconds and never fails
an installation. `@hashbrownai/core` also writes a random installation id into
its own package folder so a development browser can cite the same install.

Turn it off:

- `DO_NOT_TRACK=1` or `HASHBROWN_TELEMETRY_DISABLED=1` in the environment stops
  the install step. `HASHBROWN_TELEMETRY_DEBUG=1` prints what would be sent and
  sends nothing.

Details, the full field list, and how to ask for deletion are at
[hashbrown.dev/docs/react/platform/collection](https://hashbrown.dev/docs/react/platform/collection)
and [hashbrown.dev/privacy](https://hashbrown.dev/privacy).
