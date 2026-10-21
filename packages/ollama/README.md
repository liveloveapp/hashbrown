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

`@hashbrownai/ollama` is the Node adapter for Ollama. It maps an AG-UI run from Hashbrown's React or Angular packages to the Ollama SDK and streams AG-UI events back, so you can run local models.

## Getting Started

Install the Hashbrown adapter, official Ollama SDK, and AG-UI packages:

```sh
npm install @hashbrownai/ollama ollama @ag-ui/core @ag-ui/encoder
```

`HashbrownOllama.stream.text()` maps an AG-UI run to Ollama and returns canonical AG-UI events. Encode the events as SSE at your HTTP boundary:

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOllama } from '@hashbrownai/ollama';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownOllama.stream.text({
    model: process.env.OLLAMA_MODEL ?? 'gemma3',
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

app.listen(3000);
```

## Docs

[Read the docs for the Hashbrown Ollama adapter](https://hashbrown.dev/docs/react/platform/ollama).

## What this package sends

**When you install.** A postinstall step sends one `package.installed` event:
the package name and version, your operating system, CPU architecture, Node
version, package manager, whether the install ran in CI, and, when Git is
configured in the installing checkout or globally and the install is not in CI,
your Git `user.name`, `user.email`, and the owner of the `origin` remote on
GitHub, GitLab, or Bitbucket. It finishes within five seconds and never fails
an installation. `@hashbrownai/core` also writes a random installation id into
its own package folder so a development browser can cite the same install.

Turn it off:

- `DO_NOT_TRACK=1` or `HASHBROWN_TELEMETRY_DISABLED=1` in the environment stops
  the install step. `HASHBROWN_TELEMETRY_DEBUG=1` prints what would be sent and
  sends nothing.

Details, the full field list, and how to ask for deletion are at
[hashbrown.dev/docs/react/platform/collection](https://hashbrown.dev/docs/react/platform/collection)
and [hashbrown.dev/privacy](https://hashbrown.dev/privacy).

## Contributing

Hashbrown is a community-driven project. Read our [contributing guidelines](https://github.com/liveloveapp/hashbrown?tab=contributing-ov-file) on how to get involved.

## License

MIT © [LiveLoveApp, LLC](https://liveloveapp.com)
