<h1 align="center">Hashbrown - Build Agents for the Browser</h1>

<p align="center">
  <img src="www/analog/public/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown is an open-source framework for 
    <br />building agents that run in the browser.</em>
  <br>
    [Read Angular Docs](https://hashbrown.dev/docs/angular/start/intro) | [Read React Docs](https://hashbrown.dev/docs/react/start/intro)
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

[What is Hashbrown](#what-is-hashbrown) | [Installation](#installation) | [Getting Started](#getting-started) | [Supported LLM Providers](#supported-llm-providers) | [Features](#features) | [Walkthroughs](#walkthroughs) | [Core Team](#core-team) | [Consulting](#consulting)

<!-- TODO: embed "marketing" video here when finished-->

<hr>

## What Is Hashbrown

Hashbrown is a set of core and framework-specific packages for the UI along with LLM SDK wrappers for Node backends. Hashbrown makes it easy to embed intelligence in your React or Angular components. Use Hashbrown to generate user interfaces, turn natural language into structured data, and predict your user's next action.

## Installation

Hashbrown typically needs three packages installed:

- @hashbrownai/core: a shared set of primitives for managing state to/from LLM providers
- @hashbrownai/<angular|react>: a framework-specific set of wrappers for the core primitives to easily tie Hashbrown into framework lifecycle flows
- @hashbrownai/<provider>: A provider-specific wrapper for Node backends that wraps a provider SDK to provide consistency between providers.

For example, to use Hashbrown with Angular and OpenAI's GPT models, you could install the requisite packages like so:

```sh
npm install @hashbrownai/{core,angular,openai} --save
```

To use Hashbrown with React and Azure, you'd instead do:

```sh
npm install @hashbrownai/{core,react,azure} --save
```

## Supported LLM Providers

Hashbrown supports a (growing) list of proprietary and open-weights models via vendor-specific packages that wrap each SDK's inputs and outputs into a consistent shape for Hashbrown to consume.

They include:

- [OpenAI](https://hashbrown.dev/docs/angular/platform/openai)
- [Azure OpenAI](https://hashbrown.dev/docs/angular/platform/azure)
- [Anthropic](https://hashbrown.dev/docs/angular/platform/anthropic)
- [Amazon Bedrock](https://hashbrown.dev/docs/angular/platform/bedrock)
- [Ollama](https://hashbrown.dev/docs/angular/platform/ollama)
- [Google Gemini](https://hashbrown.dev/docs/angular/platform/google)
- [Writer](https://hashbrown.dev/docs/angular/platform/writer)

Note that any model supported by a vendor's SDK will generally be usable via Hashbrown. That said, not all models (especially some older, smaller ones) will be able to handle the full feature set of Hashbrown.

## Getting Started

### In Node

Hashbrown backend SDK wrappers put a consistent API surface around varied SDK APIs, and allow you to provide API keys and model choices, as well as other vendor-specific parameters.

Hashbrown uses HTTP streaming to communicate between Node backends and UI
hooks/resources.

The below example demonstrates exposing a POST endpoint `/chat` that:

- takes in a completion parameters, like a set of messages, schema and tool calls/definitions
- streams LLM responses back to the Hashbrown UI mechanisms

Note: the URL is configurable in Hashbrown and need not be 'chat', so long as it matches in the backend and UI.

```typescript
import { HashbrownOpenAI } from '@hashbrownai/openai';

app.post('/chat', async (req, res) => {
  const stream = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY!,
    request: req.body, // must be Chat.Api.CompletionCreateParams
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk); // Pipe each encoded frame as it arrives
  }

  res.end();
});
```

See [sample server main.ts](/samples/smart-home/server/src/main.ts) for a fuller example.

### In React

Configure the provider:

```ts
export function Providers() {
  return (
    <HashbrownProvider url={url}>
      {children}
    </HashbrownProvider>
  )
}
```

With the provider set up, you can use Hashbrown hooks anywhere in your application.

Our docs site has various examples and recipes, like [extracting structured data from a text input](https://hashbrown.dev/docs/react/recipes/natural-language-to-structured-data).

### In Angular

Configure the provider:

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      baseUrl: '/api/chat',
    }),
  ],
};
```

With the provider set up, you can use Hashbrown hooks anywhere in your application.

Our docs site has various examples and recipes, like [equipping a chatbot with tool calling](https://hashbrown.dev/docs/angular/recipes/ui-chatbot).

## Features

Hashbrown offers a toolkit of ways to enhance a UI with intelligence:

- input completions
- structured completions (i.e. natural language )
- component selection and rendering
- tool calling
- code generation and execution

Each of these can interact with an app's state, persistence, components, etc., so there is a maximum flexibility in how and when to apply AI.

In addition, because LLMs can handle most languages, all Hashbrown features can handle most any language as an input or output.

We've chosen to document them in the context of each UI framework we support.

For Angular: https://hashbrown.dev/docs/angular/start/intro

For React: https://hashbrown.dev/docs/react/start/intro

## Sample Apps

To enable demonstration, ideation and development, we've added several sample apps to the repo. These apps have state, reactivity, etc., just like a full-fledged app. They also each include a simple backend server to enable using LLM providers, but they don't generally include persistence, etc.

### Angular Smart Home

An Angular-based smart home app that can control lights, create and apply scenes and schedule events. Users can interact with a chat prompt that can render lights, scenes, etc. right in the chat.

Smart-home-server is set up to use OpenAI (you'll just need to provide your API key as an environment variable), but can be quickly adapted to any of our other backend wrappers.

```shell
nvm use
npm install
npx nx serve smart-home-server && npx nx serve smart-home-angular
```

### React Smart Home

A React-based smart home app that can control lights, create and apply scenes and schedule events. Users can interact with a chat prompt that can render lights, scenes, etc. right in the chat.

Smart-home-server is set up to use OpenAI (you'll just need to provide your API key as an environment variable), but can be quickly adapted to any of our other backend wrappers.

```shell
nvm use
npm install
npx nx serve smart-home-server && npx nx serve smart-home-react
```

### Angular Finance

The finance app comes with a large amount of data representing breakfast food supplies, and it demonstrates Hashbrown's ability to generate Javascript to slice/rollup data, configure a chart in an arbitrary way, and then render that chart for a user.

Note: the theme can be changed via natural language, like "Make the legend bigger and green". "1990s Excel" has proven a popular choice.

```shell
nvm use
npm install
npx nx serve finance-server && npx nx serve finance-angular
```

### Angular Kitchen Sink

The Kitchen Sink app is a version of the Angular smart home app with an expanded feature set. It serves as an experimental playground for contributors exploring and adding new features and mechanisms (i.e. "explain this page to me").

```shell
nvm use
npm install
npx nx serve kitchen-sink-server && npx nx serve kitchen-sink-angular
```

## Core Team

`hashbrown` is a community effort led by Mike Ryan, Brian Love and Ben Taylor.

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](./CONTRIBUTING.md) on how to get involved.

## Consulting

Hashbrown is built in the open by [LiveLoveApp](https://www.liveloveapp.com). We love building products for the web, and have helped engineering teams across startups, banking, and finance.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
