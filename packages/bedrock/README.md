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

```sh
npm install @hashbrownai/bedrock --save
```

Deploy an express server with a single /chat endpoint to use Hashbrown with Amazon Bedrock.

```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownBedrock } from '@hashbrownai/bedrock';

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.Api.CompletionCreateParams;
  const stream = HashbrownBedrock.stream.text({
    region: process.env.AWS_REGION!,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

In the UI package for your chosen framework, set the emulateStructuredOutput flag to true.

In Angular:

```
import { provideHashbrown } from '@hashbrownai/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHashbrown({
      baseUrl: '/api/chat',
      emulateStructuredOutput: true,
    }),
  ],
};
```

## Docs

[Read the docs for the Hashbrown Amazon Bedrock adapter](https://hashbrown.dev/docs/react/platform/bedrock).

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## Workshops and Consulting

Want to learn how to build web apps with AI? [Learn more about our workshops](https://hashbrown.dev/workshops).

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices. [Learn more about LiveLoveApp](https://liveloveapp.com).

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
