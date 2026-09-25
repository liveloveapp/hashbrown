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
  system: 'Help users understand invoices.',
  components: [
    exposeComponent(InvoiceCard, {
      description: 'Show one invoice',
      input: { id: s.string('Invoice id') },
    }),
  ],
  tools: [
    createTool({
      name: 'getInvoices',
      description: 'List the invoices',
      handler: () => inject(InvoiceApi).list(),
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

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
