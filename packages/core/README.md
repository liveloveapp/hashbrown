<h1 align="center">Hashbrown</h1>

<p align="center">
  <img src="https://hashbrown.dev/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <strong>AI chat and agents for your React or Angular app.</strong>
  <br>
  <em>Hashbrown is a headless TypeScript framework. The model renders your
    <br />components and calls your tools, in the browser, with any provider.</em>
  <br>
</p>

<p align="center">
  <a href="https://hashbrown.dev/"><strong>hashbrown.dev</strong></a>
  <br>
</p>

`@hashbrownai/core` holds the framework-agnostic primitives that Hashbrown's React and Angular packages build on: the Skillet schema language, the streaming JSON parser, and the chat state that talks to your server. Install it next to a framework package and a model adapter.

## Features

- **Generative UI.** The model composes your components. Bundle them into UI kits.
- **Client-side tools.** The model calls functions in your app. Connect MCP servers too.
- **Structured output.** Skillet schemas turn model output into typed JSON.
- **Streaming.** Strings, arrays, and objects parse as they arrive. Magic Text streams Markdown.
- **Any model.** OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama, or a model in the browser.
- **Code execution.** Run model-written JavaScript in a sandbox.

## Getting Started with Angular

```sh
npm install @hashbrownai/{core,angular,openai}
```

Point Hashbrown at your server:

```ts
export const appConfig: ApplicationConfig = {
  providers: [provideHashbrown({ baseUrl: '/run' })],
};
```

Then follow the [Angular quick start](https://hashbrown.dev/docs/angular/start/quick).

## Getting Started with React

```sh
npm install @hashbrownai/{core,react,openai}
```

Point Hashbrown at your server:

```tsx
<HashbrownProvider url="/run">{children}</HashbrownProvider>
```

Then follow the [React quick start](https://hashbrown.dev/docs/react/start/quick).

## Connect a Model

Your server keeps the API key and streams from a Hashbrown adapter:

- [OpenAI](https://hashbrown.dev/docs/angular/platform/openai): `@hashbrownai/openai`
- [Anthropic](https://hashbrown.dev/docs/angular/platform/anthropic): `@hashbrownai/anthropic`
- [Google Gemini](https://hashbrown.dev/docs/angular/platform/google): `@hashbrownai/google`
- [Amazon Bedrock](https://hashbrown.dev/docs/angular/platform/bedrock): `@hashbrownai/bedrock`
- [Azure OpenAI](https://hashbrown.dev/docs/angular/platform/azure): `@hashbrownai/azure`
- [Ollama](https://hashbrown.dev/docs/angular/platform/ollama): `@hashbrownai/ollama`
- [Your own backend](https://hashbrown.dev/docs/angular/platform/custom)

## Need a Complete Chat UI?

Hashbrown is headless. [threadplane](https://threadplane.ai) is the full agent UI for React and Angular, built on Hashbrown: threads, approvals, and tool progress. Free and MIT, with enterprise support from the team behind Hashbrown.

Stuck? Ask Brian at https://hashbrown.dev/unstuck.

## Opt-in HTTP response retries

`createHttpTransport` can wait and retry selected HTTP rejections before an
AG-UI event stream starts. The policy is off by default. Configure it on a
transport and pass that transport to `provideHashbrown` or `HashbrownProvider`.

For example, ATC's b4.run backend rejects an overlapping run at admission with
HTTP 409, `Retry-After`, and a `run_in_flight` error. Its shared transport selects
that explicit rejection:

```ts
import { createHttpTransport } from '@hashbrownai/core';

const transport = createHttpTransport({
  baseUrl: '/api/run',
  retry: {
    maxRetries: 60,
    maxElapsedMs: 60_000,
    shouldRetry: ({ status, bodyText, bodyTruncated, retryAfterMs }) => {
      if (
        status !== 409 ||
        bodyTruncated ||
        !(retryAfterMs && retryAfterMs > 0)
      ) {
        return false;
      }
      try {
        const { error } = JSON.parse(bodyText);
        return (
          error?.kind === 'request_error' &&
          error?.details?.code === 'run_in_flight'
        );
      } catch {
        return false;
      }
    },
  },
});
```

Only select responses your server guarantees rejected the request before
execution. A status such as 409, 429 or 503 alone does not establish that safety.
The context includes isolated headers and a body snapshot limited to 16 KiB,
with `bodyTruncated` indicating whether more bytes were present. Failed or timed
out body reads do not reach the predicate. Predicate failures stop retrying.

`maxRetries` counts additional physical HTTP requests within one transport send.
`maxElapsedMs` bounds retry decisions and waiting; it does not cut off an issued
fetch or accepted stream. Valid [`Retry-After`](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)
delta-seconds or HTTP dates take precedence over `delayMs` (default 1000 ms). A server delay outside the remaining
budget ends with the current HTTP error; it is never shortened. Invalid hints
use the fallback, while overflow-sized hints stop retries.

The transport serializes once and runs middleware once, then reuses the same
request body, headers, run/thread IDs and abort signal. With retries enabled,
post-middleware bodies must be strings. Authorization middleware is not rerun
for each physical request. Cancellation or disposal stops waiting and prevents
late retries. Successful streams, partial output, network errors and protocol
errors are not replayed by this policy.

This is separate from the chat runtime's `retries` setting, which governs other
transport/protocol failures. Exhausted HTTP response retries produce a
nonretryable HTTP error; subsequent network failures still follow the runtime's
existing retry policy. Neither setting is a global wall-time limit across all
generation attempts. Omitting the policy, or setting `maxRetries: 0`, preserves
the existing HTTP behavior.
