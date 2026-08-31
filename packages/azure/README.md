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
npm install @hashbrownai/azure openai @ag-ui/core @ag-ui/encoder --save
```

Deploy an Express server with a `/run` endpoint to use Hashbrown with Azure OpenAI.

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownAzure } from '@hashbrownai/azure';

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownAzure.stream.text({
    clientOptions: {
      apiKey: process.env.AZURE_API_KEY!,
      endpoint: process.env.AZURE_ENDPOINT!,
      apiVersion: process.env.AZURE_API_VERSION!,
      deployment: process.env.AZURE_DEPLOYMENT,
    },
    model: process.env.AZURE_MODEL!,
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

## Docs

[Read the docs for the Hashbrown Azure OpenAI adapter](https://hashbrown.dev/docs/react/platform/azure).

## Contributing

hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## Workshops and Consulting

Want to learn how to build web apps with AI? [Learn more about our workshops](https://hashbrown.dev/workshops).

LiveLoveApp provides hands-on engagement with our AI engineers for architecture reviews, custom integrations, proof-of-concept builds, performance tuning, and expert guidance on best practices. [Learn more about LiveLoveApp](https://liveloveapp.com).

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
