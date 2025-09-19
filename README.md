<h1 align="center">Hashbrown - Build Joyful, AI-Powered User Interfaces</h1>

<p align="center">
  <img src="www/public/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown is an open-source framework for building AI-powered user interfaces
    <br />that converse with users, dynamically reorganize, and even code themselves.</em>
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

[What is Hashbrown](#what-is-hashbrown) | [Installation](#installation) | [Getting Started](#getting-started) | [Supported LLM Providers](#supported-llm-providers) | [Features](#features) | [Walkthroughs](#walkthroughs) | [Core Team](#core-team) | [Workshops and Consulting](#workshops-and-consulting)

<!-- TODO: embed "marketing" video here when finished-->

<hr>

## What Is Hashbrown

Hashbrown is a set of core and framework-specific packages for the UI along with LLM SDK wrappers for Node backends. Hashbrown makes it easy to embed intelligence in individual features and to orchestrate and dynamically update whole applications based on real-time, natural language inputs.

## Installation

Hashbrown typically needs three libs installed

* @hashbrownai/core: a shared set of primitives for managing state to/from LLM providers
* @hashbrownai/<angular|react>: a framework-specific set of wrappers for the core primitives to easily tie Hashbrown into framework lifecycle flows
* @hashbrownai/<provider>: A provider-specific wrapper for Node backends that wraps a provider SDK to provide consistency between providers.

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
- [Ollama](https://hashbrown.dev/docs/angular/platform/ollama)
- [Google Gemini](https://hashbrown.dev/docs/angular/platform/google)
- [Writer](https://hashbrown.dev/docs/angular/platform/writer)

Coming soon:

- Anthropic
- Vercel

Note that any model supported by a vendor's SDK will generally be usable via Hashbrown.  That said, not all models (especially some older, smaller ones) will be able to handle the full feature set of Hashbrown.

## Getting Started

### In Node

// TODO: drop a bit here on why this is needed

// TODO: code example showing usage with open ai (get from slim sample app)

// TODO: call out where API key goes and why

### In React

Install:

// TODO: take the openai part out of this and angular so we can
// explain it separately

```sh
npm install @hashbrownai/{core,react,openai} --save
```

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

### In Angular

Install:

```sh
npm install @hashbrownai/{core,angular,openai} --save
```

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

## Features

// TODO: walkthrough completions, etc

// TODO: link to docs, multiple links to multiple places to help them find
// their way

## Sample Apps

To enable demonstration, ideation and development, we've added several sample apps to the repo.  These apps have state, reactivity, etc., just like a full-fledged app.  They also each include a simple backend server to enable using LLM providers, but they don't generally include persistence, etc.

### Angular Smart Home 
An Angular-based smart home app that can control lights, create and apply scenes and schedule events.  Users can interact with a chat prompt that can render lights, scenes, etc. right in the chat.

Smart-home-server is set up to use OpenAI (you'll just need to provide your API key as an environment variable), but can be quickly adapted to any of our other backend wrappers.

```shell
nvm use
npm install
npx nx serve smart-home-server && npx nx serve smart-home-angular
```

### React Smart Home 
A React-based smart home app that can control lights, create and apply scenes and schedule events.  Users can interact with a chat prompt that can render lights, scenes, etc. right in the chat.

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

The Kitchen Sink app is a version of the Angular smart home app with an expanded feature set.  It serves as an experimental playground for contributors exploring and adding new features and mechanisms (i.e. "explain this page to me").  

```shell
nvm use
npm install
npx nx serve kitchen-sink-server && npx nx serve kitchen-sink-angular
```

## Hashbrown.dev 

Run the documentation website locally:

```shell
nvm use
npm install
# If needed, generate build dependencies (i.e. docs from code)
npx nx run www:collect-docs 
# Run the server
npx nx serve www
```

## Core Team

`hashbrown` is a community effort led by Mike Ryan, Brian Love and Ben Taylor.

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](./CONTRIBUTING.md) on how to get involved.

## Workshops and Consulting

Want to learn how to build Angular and React apps with AI? [Learn more about our workshops](https://hashbrown.dev/workshops).

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices. [Learn more about LiveLoveApp](https://liveloveapp.com).

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
