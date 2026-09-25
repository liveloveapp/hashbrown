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

`@hashbrownai/react` gives you Hashbrown's hooks and components for React: chat and UI chat hooks, tools, UI kits, and Magic Text rendering.

## Getting Started

```sh
npm install @hashbrownai/{core,react,openai}
```

Point Hashbrown at your server:

```tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return <HashbrownProvider url="/run">{children}</HashbrownProvider>;
}
```

`HashbrownProvider` accepts:

- `url` (required): Base URL of your Hashbrown API endpoint.
- `middleware` (optional): Functions to transform requests before they are sent.
- `transport` (optional): Custom AG-UI transport for descendant hooks.

Expose your components and give the model tools. The model only renders components you register, and Skillet validates their props. Tools run in the browser, with your app's state and services.

```tsx
export function InvoiceChat({ api }: { api: InvoiceApi }) {
  const getInvoices = useTool({
    name: 'getInvoices',
    description: 'List the invoices',
    handler: () => api.list(),
    deps: [api],
  });

  const chat = useUiChat({
    system: 'Help users understand invoices.',
    components: [
      exposeComponent(InvoiceCard, {
        description: 'Show one invoice',
        props: { id: s.string('Invoice id') },
      }),
    ],
    tools: [getInvoices],
  });

  // Components render while the response streams in.
  return chat.messages.map((message) =>
    message.role === 'assistant' ? message.ui : message.content,
  );
}
```

## Docs

Read the [React quick start](https://hashbrown.dev/docs/react/start/quick) and the [React docs](https://hashbrown.dev/docs/react/start/intro).

## Connect a Model

Your server keeps the API key and streams from a Hashbrown adapter:

- [OpenAI](https://hashbrown.dev/docs/react/platform/openai): `@hashbrownai/openai`
- [Anthropic](https://hashbrown.dev/docs/react/platform/anthropic): `@hashbrownai/anthropic`
- [Google Gemini](https://hashbrown.dev/docs/react/platform/google): `@hashbrownai/google`
- [Amazon Bedrock](https://hashbrown.dev/docs/react/platform/bedrock): `@hashbrownai/bedrock`
- [Azure OpenAI](https://hashbrown.dev/docs/react/platform/azure): `@hashbrownai/azure`
- [Ollama](https://hashbrown.dev/docs/react/platform/ollama): `@hashbrownai/ollama`
- [Your own backend](https://hashbrown.dev/docs/react/platform/custom)

## Need a Complete Chat UI?

Hashbrown is headless. [threadplane](https://threadplane.ai) is the full agent UI for React and Angular, built on Hashbrown: threads, approvals, and tool progress. Free and MIT, with enterprise support from the team behind Hashbrown.

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
