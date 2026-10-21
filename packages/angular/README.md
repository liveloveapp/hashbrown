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

`@hashbrownai/angular` gives you Hashbrown's resources and components for Angular: chat and UI chat resources, tools, UI kits, and message rendering.

## Getting Started

```sh
npm install @hashbrownai/{core,angular,openai}
```

Point Hashbrown at your server:

```ts
export const appConfig: ApplicationConfig = {
  providers: [provideHashbrown({ baseUrl: '/run' })],
};
```

Expose your components and give the model tools. The model only renders components you register, and Skillet validates their inputs. Tools run in the browser, with your app's state and services.

```ts
chat = uiChatResource({
  system: 'Help users understand the air traffic on the map.',
  components: [
    exposeComponent(FlightCard, {
      description: 'Show one aircraft',
      input: { hex: s.string('Aircraft hex code') },
    }),
  ],
  tools: [
    createTool({
      name: 'getAircraft',
      description: 'List the aircraft on the map',
      handler: () => inject(AircraftApi).list(),
    }),
  ],
});
```

Render the stream. Components render while the response streams in.

<!-- prettier-ignore -->
```html
@for (message of chat.value(); track $index) {
  <hb-render-message [message]="message" />
}
```

## Docs

Read the [Angular quick start](https://hashbrown.dev/docs/angular/start/quick) and the [Angular docs](https://hashbrown.dev/docs/angular/start/intro).

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

Hashbrown sends two kinds of usage observations so we can see where
developers get stuck. Neither includes prompts, messages, schemas, tool
arguments, component props, URLs, or thread identifiers.

**When you install.** A postinstall step sends one `package.installed` event:
the package name and version, your operating system, CPU architecture, Node
version, package manager, whether the install ran in CI, and, when Git is
configured in the installing checkout or globally and the install is not in CI,
your Git `user.name`, `user.email`, and the owner of the `origin` remote on
GitHub, GitLab, or Bitbucket. Every package reads or creates a random id in
`~/.hashbrown/installation-id` and sends it with the event, so repeat installs
on one machine are counted once. It finishes within five seconds and never
fails an installation. `@hashbrownai/core` also writes a random installation id
into its own package folder and sends it with its event so a development
browser can cite the same install.

**While you develop.** In a development build in a browser, Hashbrown reports
when a chat runtime starts, the first completed stream, the first tool call,
and the first rendered component, once per session, with the package name and
version, the framework, and the transport kind. Production builds, server
rendering, automated browsers, and test runners (jsdom, happy-dom,
`NODE_ENV=test`) send nothing.

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
[hashbrown.dev/docs/angular/platform/collection](https://hashbrown.dev/docs/angular/platform/collection)
and [hashbrown.dev/privacy](https://hashbrown.dev/privacy).

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
