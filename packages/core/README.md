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

## What this package sends

Hashbrown sends two kinds of anonymous usage observations so we can see where
developers get stuck. Neither includes prompts, messages, schemas, tool
arguments, component props, URLs, or thread identifiers.

**When you install.** A postinstall step sends one `package.installed` event:
the package name and version, your operating system, CPU architecture, Node
version, package manager, whether the install ran in CI, and, when Git is
configured in the installing checkout or globally and the install is not in CI,
your Git `user.name`, `user.email`, and the owner of the `origin` remote on
GitHub, GitLab, or Bitbucket. It finishes within five seconds and never fails
an installation. `@hashbrownai/core` also writes a random installation id into
its own package folder so a development browser can cite the same install.

**While you develop.** In a development build in a browser, Hashbrown reports
when a chat runtime starts, the first completed stream, the first tool call,
and the first rendered component, once per session, with the package name and
version, the framework, and the transport kind. Production builds, server
rendering, and automated browsers send nothing.

Turn it off:

- `DO_NOT_TRACK=1` or `HASHBROWN_TELEMETRY_DISABLED=1` in the environment stops
  the install step. `HASHBROWN_TELEMETRY_DEBUG=1` prints what would be sent and
  sends nothing.
- `localStorage.setItem('HASHBROWN_TELEMETRY_DISABLED', '1')` or
  `window.__HASHBROWN_TELEMETRY_DISABLED__ = true` stops the browser collector.
- `<HashbrownProvider telemetry={false}>` (React) or
  `provideHashbrown({ telemetry: false })` (Angular) stops it for the app, and a
  nested provider cannot turn it back on.
- `setDevelopmentCollectionEnabled(false)` from `@hashbrownai/react` or
  `@hashbrownai/angular` before the first runtime is created.

Details, the full field list, and how to ask for deletion are at
[hashbrown.dev/docs/react/platform/collection](https://hashbrown.dev/docs/react/platform/collection),
[hashbrown.dev/docs/angular/platform/collection](https://hashbrown.dev/docs/angular/platform/collection),
and [hashbrown.dev/privacy](https://hashbrown.dev/privacy).

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
