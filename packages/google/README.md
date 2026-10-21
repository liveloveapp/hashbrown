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

`@hashbrownai/google` is the Node adapter for Google Gemini. It maps an AG-UI run from Hashbrown's React or Angular packages to the Google Gemini SDK and streams AG-UI events back. Your server keeps the API key.

## Getting Started

```sh
npm install @hashbrownai/google @google/genai @ag-ui/core @ag-ui/encoder --save
```

Deploy an Express server with a `/run` endpoint to use Hashbrown with Google Gemini.

```ts
import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownGoogle } from '@hashbrownai/google';

app.post('/run', async (req, res) => {
  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());
  const stream = HashbrownGoogle.stream.text({
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash',
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

[Read the docs for the Hashbrown Google Gemini adapter](https://hashbrown.dev/docs/react/platform/google).

## What this package sends

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
