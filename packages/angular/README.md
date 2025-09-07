<h1 align="center">Hashbrown - Build Generative User Interfaces</h1>

<p align="center">
  <img src="https://hashbrown.dev/image/logo/brand-mark.svg" alt="Hashbrown Logo" width="144px" height="136px"/>
  <br>
  <em>Hashbrown is an open-source framework for building user interfaces
    <br />that converse with users, dynamically reorganize, and even code themselves.</em>
  <br>
</p>

<p align="center">
  <a href="https://hashbrown.dev/"><strong>hashbrown.dev</strong></a>
  <br>
</p>

## Getting Started

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

## Adapters

Hashbrown supports multiple providers:

- [OpenAI](https://hashbrown.dev/docs/angular/platform/openai)
- [Azure OpenAI](https://hashbrown.dev/docs/angular/platform/azure)
- [Google Gemini](https://hashbrown.dev/docs/angular/platform/google)
- [Writer](https://hashbrown.dev/docs/angular/platform/writer)
- [Ollama](https://hashbrown.dev/docs/angular/platform/ollama)

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## Workshops and Consulting

Want to learn how to build Angular apps with AI? [Learn more about our workshops](https://hashbrown.dev/workshops).

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices. [Learn more about LiveLoveApp](https://liveloveapp.com).

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
