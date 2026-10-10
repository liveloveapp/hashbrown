<h1 align="center">Hashbrown</h1>

<p align="center">
  <img src="www/public/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <strong>AI chat and agents for your React or Angular app.</strong>
  <br>
  <em>Hashbrown is a headless TypeScript framework. The model renders your
    <br />components and calls your tools, in the browser, with any provider.</em>
  <br>
  <br>
    <a href="https://hashbrown.dev/docs/angular/start/quick">Angular quick start</a> | <a href="https://hashbrown.dev/docs/react/start/quick">React quick start</a>
  <br>
</p>

<p align="center">
  <a href="https://hashbrown.dev/"><strong>hashbrown.dev</strong></a>
  <br>
</p>

<p align="center">
  <a href="https://github.com/liveloveapp/hashbrown/issues">Submit an Issue</a> |
  <a href="CONTRIBUTING.md">Contributing Guidelines</a> |
  <a href="CODE_OF_CONDUCT.md">Code of Conduct</a>
  <br>

</p>

<p align="center">
  <a href="https://www.npmjs.com/@hashbrownai/core">
    <img src="https://img.shields.io/npm/v/@hashbrownai/core.svg?logo=npm&logoColor=fff&label=NPM+package&color=orange" alt="Hashbrown on npm" />
  </a>
</p>

[What is Hashbrown](#what-is-hashbrown) | [Installation](#installation) | [How it works](#how-it-works) | [Features](#features) | [Connect a model](#connect-a-model) | [See it in a real app](#see-it-in-a-real-app) | [Contributing](#contributing)

<hr>

## What Is Hashbrown

Hashbrown is a headless TypeScript framework for AI chat and agents in React
and Angular. It brings generative UI from your own components, client-side
tools, and streaming structured output from any model. Hashbrown ships no chat
UI of its own: you keep your components and your design system.

- **Generative UI.** The model only renders components you register, and
  Skillet schemas validate their props.
- **Tools in the browser.** Tools run in your app, with its state and services.
- **Built for streaming.** Components render while the response streams in.
- **Any model.** Your server keeps the API key and streams from OpenAI,
  Anthropic, Gemini, Bedrock, Azure, or Ollama.

## Installation

Hashbrown has three kinds of packages:

- `@hashbrownai/core`: the framework-agnostic primitives, including the Skillet schema language and the streaming JSON parser
- `@hashbrownai/<angular|react>`: resources, hooks, and components for your framework
- `@hashbrownai/<provider>`: a Node adapter that streams from a model provider's SDK

For Angular and OpenAI:

```sh
npm install @hashbrownai/{core,angular,openai}
```

For React and OpenAI:

```sh
npm install @hashbrownai/{core,react,openai}
```

## How It Works

The same API in React and Angular.

### 1. Expose your components

The model only renders components you register. Skillet validates their props.

Angular:

```ts
const components = [
  exposeComponent(FlightCardComponent, {
    name: 'FlightCard',
    description: 'One aircraft on the map, with live altitude and speed.',
    input: {
      note: s.streaming.string('A sentence or two about this flight'),
      hex: s.string('The aircraft hex code from a tool result.'),
    },
    children: false,
  }),
];
```

React:

```tsx
const components = [
  exposeComponent(FlightCard, {
    name: 'FlightCard',
    description: 'One aircraft on the map, with live altitude and speed.',
    props: {
      note: s.streaming.string('A sentence or two about this flight'),
      hex: s.string('The aircraft hex code from a tool result.'),
    },
    children: false,
  }),
];
```

### 2. Give it tools

Tools run in the browser, with your app's state and services.

Angular:

```ts
chat = uiChatResource({
  system: 'Help users understand the planes on the map.',
  components,
  tools: [createTool(this.atc.findAircraft)],
});
```

React:

```tsx
export function Assistant() {
  const store = useAtcStore();
  const atc = useMemo(() => createAtcTools({ store, fetchRoute }), [store]);
  const findAircraft = useTool({ ...atc.findAircraft, deps: [atc] });

  const chat = useUiChat({
    system: 'Help users understand the planes on the map.',
    components,
    tools: [findAircraft],
  });

  // Render the stream (step 3).
}
```

### 3. Render the stream

Components render while the response streams in.

Angular:

<!-- prettier-ignore -->
```html
@for (message of chat.value(); track $index) {
  <hb-render-message [message]="message" />
}
```

React, at the end of `Assistant`:

```tsx
return chat.messages.map((message) =>
  message.role === 'assistant' ? message.ui : message.content,
);
```

Before you use Hashbrown's hooks or resources, point them at your server.

Angular:

```ts
export const appConfig: ApplicationConfig = {
  providers: [provideHashbrown({ baseUrl: '/api/run' })],
};
```

React:

```tsx
<HashbrownProvider url="/api/run">{children}</HashbrownProvider>
```

## Features

| Feature                                                                           | What it does                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Generative UI](https://hashbrown.dev/docs/angular/concept/components)            | The model composes your components. Bundle them into UI kits.                   |
| [Client-side tools](https://hashbrown.dev/docs/angular/concept/functions)         | The model calls functions in your app. Connect MCP servers too.                 |
| [Structured output](https://hashbrown.dev/docs/angular/concept/structured-output) | Skillet schemas turn model output into typed JSON.                              |
| [Streaming](https://hashbrown.dev/docs/angular/concept/streaming)                 | Strings, arrays, and objects parse as they arrive. Magic Text streams Markdown. |
| [Any model](https://hashbrown.dev/docs/angular/start/platforms)                   | OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama, or a model in the browser.   |
| [Code execution](https://hashbrown.dev/docs/angular/concept/runtime)              | Run model-written JavaScript in a sandbox.                                      |

Every feature is documented for both frameworks:
[Angular docs](https://hashbrown.dev/docs/angular/start/intro) |
[React docs](https://hashbrown.dev/docs/react/start/intro)

## Connect a Model

Your server keeps the API key. A Hashbrown adapter maps an AG-UI run to your
provider's SDK and streams AG-UI events back to the browser.

- [OpenAI](https://hashbrown.dev/docs/angular/platform/openai): `@hashbrownai/openai`
- [Anthropic](https://hashbrown.dev/docs/angular/platform/anthropic): `@hashbrownai/anthropic`
- [Google Gemini](https://hashbrown.dev/docs/angular/platform/google): `@hashbrownai/google`
- [Amazon Bedrock](https://hashbrown.dev/docs/angular/platform/bedrock): `@hashbrownai/bedrock`
- [Azure OpenAI](https://hashbrown.dev/docs/angular/platform/azure): `@hashbrownai/azure`
- [Ollama](https://hashbrown.dev/docs/angular/platform/ollama): `@hashbrownai/ollama`
- [Your own backend](https://hashbrown.dev/docs/angular/platform/custom)

Hashbrown's UI packages post to `/run` by default. You can change the URL as
long as the server and the UI use the same one. An Express endpoint with the
OpenAI adapter:

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';

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
```

Not every model handles every feature. Some older, smaller models struggle with
generative UI and tool calling.

## See It in a Real App

[atc](examples/atc/README.md) is a live map of airline traffic around Chicago
O'Hare with an assistant that answers in your own components: flight cards,
arrivals boards and aircraft comparisons. It is built twice, in Angular and
React, from one framework-free core. The aircraft data is real, from
[adsb.lol](https://adsb.lol).

[Try the app](https://atc.hashbrown.dev) or run it locally. Put
`OPENAI_API_KEY=...` in the repository's `.env`, then run each in its own
terminal:

```shell
nvm use
npm ci
npx nx serve atc-server
```

```shell
npx nx serve atc-react
```

Open http://127.0.0.1:4342/react/. Use `atc-angular` and port 4341 for the
Angular app. See the [example README](examples/atc/README.md) for the
architecture and tests.

For a larger app with tables, charts and an agent backend, see the advanced
[Invoicing](examples/invoicing/README.md) example
([try it](https://invoicing.hashbrown.dev)).

## Need a Complete Chat UI?

Hashbrown is headless. [threadplane](https://threadplane.ai) is the full agent
UI for React and Angular, built on Hashbrown: threads, approvals, and tool
progress. Free and MIT, with enterprise support from the team behind Hashbrown.

## Core Team

Hashbrown is led by Brian Love. We are always eagerly looking for contributors
and collaborators, so if you'd like to help shape Hashbrown, we'd love to hear
from you.

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](./CONTRIBUTING.md) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
