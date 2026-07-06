# Ollama Client Options Design

## Context

Issue #471 reports that `OLLAMA_HOST` is not respected when Hashbrown's Ollama adapter runs in a different container from the Ollama server. The current adapter uses the default exported `OllamaClient` for local calls, so Hashbrown has no chance to pass a host into `new Ollama({ host })`. Existing integration tests try to pass `host` through `transformRequestOptions`, but `host` is client configuration, not a chat request option.

Provider comparison:

- OpenAI and Anthropic expose `baseURL` for endpoint-like configuration.
- Azure exposes `endpoint`.
- Google exposes explicit auth mode fields.
- Bedrock exposes `client?: BedrockRuntimeClient` plus common constructor fields.

Ollama is closest to Bedrock because local/container deployments may need either a simple host URL or a fully configured SDK client.

## Goals

- Fix #471 with an explicit public `host` option for the common Docker/container case.
- Keep the API surface small.
- Add a `client` escape hatch for advanced Ollama SDK configuration.
- Preserve existing default local behavior when no client options are provided.
- Preserve existing Turbo behavior.
- Clarify that `transformRequestOptions` only mutates the chat request.

## Non-Goals

- Do not add more implicit environment-variable behavior.
- Do not expose every Ollama SDK constructor option directly through Hashbrown.
- Do not change Hashbrown's chat request shape or streaming frame behavior.

## API Design

Extend `HashbrownOllama.stream.text(options)` with two local client options:

```ts
type BaseOllamaTextStreamOptions = {
  request: Chat.Api.CompletionCreateParams;
  client?: Ollama;
  host?: string;
  turbo?: { apiKey: string };
  transformRequestOptions?: (
    options: ChatRequest & { stream: true },
  ) =>
    | (ChatRequest & { stream: true })
    | Promise<ChatRequest & { stream: true }>;
};
```

Document precedence:

1. `client`
2. `turbo`
3. `host`
4. default Ollama client

The API intentionally exposes only `host` as a convenience field. Advanced configuration such as custom headers, fetch, or proxy should use `client`.

## Implementation Sketch

```ts
function getOllamaClient(options: OllamaTextStreamOptions): Ollama {
  if (options.client) {
    return options.client;
  }

  if (options.turbo) {
    return new Ollama({
      host: 'https://ollama.com',
      headers: {
        Authorization: `Bearer ${options.turbo.apiKey}`,
      },
    });
  }

  if (options.host) {
    return new Ollama({
      host: options.host,
    });
  }

  return OllamaClient;
}
```

`text()` should call `getOllamaClient(options)` and then call `client.chat(resolvedOptions)` as it does today.

## Developer Documentation

Update React and Angular Ollama platform docs.

Simple containerized local Ollama:

```ts
HashbrownOllama.stream.text({
  host: 'http://ollama:11434',
  request: req.body,
});
```

Advanced client configuration:

```ts
import { Ollama } from 'ollama';

const client = new Ollama({
  host: 'http://ollama:11434',
  headers: {
    'x-service': 'hashbrown',
  },
});

HashbrownOllama.stream.text({
  client,
  request: req.body,
});
```

Turbo:

```ts
HashbrownOllama.stream.text({
  turbo: {
    apiKey: process.env.OLLAMA_API_KEY!,
  },
  request: req.body,
});
```

Docs should remove claims that the default local path honors `OLLAMA_HOST`. Instead, state that callers should pass `host` or a preconfigured `client`.

## Testing

Add focused unit coverage with the `ollama` module mocked:

- Default local path uses the default exported Ollama client.
- `host` creates `new Ollama({ host })`.
- `client` uses the supplied client directly.
- `turbo` creates `new Ollama({ host: 'https://ollama.com', headers: { Authorization: ... } })`.
- `transformRequestOptions` continues to mutate only the chat request options.

Update integration tests to pass `host: OLLAMA_HOST` when `OLLAMA_HOST` is set, instead of adding `host` to `transformRequestOptions`.

Verification commands:

```sh
npx nx build ollama
npx nx test ollama
npx nx lint ollama
npx nx build-api-report ollama
```

Run `npx nx e2e ollama` when a reachable Ollama or Turbo configuration is available.
