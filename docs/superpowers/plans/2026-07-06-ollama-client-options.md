# Ollama Client Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Ollama local client configuration via `host` and `client` while preserving default local and Turbo behavior.

**Architecture:** `HashbrownOllama.stream.text()` will resolve an Ollama client before sending the chat request. Client selection precedence is `client` > `turbo` > `host` > default client. Request mutation remains isolated to `transformRequestOptions`.

**Tech Stack:** TypeScript, Nx, Jest, Ollama JS SDK, Analog docs markdown.

---

### Task 1: Add Failing Client-Selection Tests

**Files:**
- Create: `packages/ollama/src/stream/text.fn.spec.ts`
- Modify if needed: `packages/ollama/jest.config.ts`

- [x] **Step 1: Inspect test target discovery**

Run: `npx jest --config packages/ollama/jest.config.ts --listTests`

Expected: identify whether non-integration unit specs are currently discovered by `nx test ollama`.

- [x] **Step 2: Write failing mocked tests**

Create unit tests that mock the `ollama` module and verify:

```ts
test('uses the default Ollama client when no client options are provided', async () => {
  // arrange a mocked default client whose chat method records calls
  // act by consuming HashbrownOllama.stream.text(...)
  // assert defaultClient.chat was called
});

test('creates an Ollama client with the configured host', async () => {
  // arrange mocked Ollama constructor
  // act with host: 'http://ollama:11434'
  // assert new Ollama({ host: 'http://ollama:11434' })
});

test('uses an explicit Ollama client when provided', async () => {
  // arrange explicit fake client with chat
  // act with client
  // assert explicit client chat was called and constructor was not used
});

test('creates an Ollama Turbo client when turbo is provided', async () => {
  // act with turbo: { apiKey: 'test-key' }
  // assert new Ollama({ host: 'https://ollama.com', headers: { Authorization: 'Bearer test-key' } })
});
```

- [x] **Step 3: Run tests and verify RED**

Run: `npx nx test ollama`

Expected: tests fail because `host` and `client` are not implemented.

### Task 2: Implement Client Selection

**Files:**
- Modify: `packages/ollama/src/stream/text.fn.ts`

- [x] **Step 1: Add public options**

Add `client?: Ollama` and `host?: string` to `BaseOllamaTextStreamOptions`.

- [x] **Step 2: Extract client resolution helper**

Add:

```ts
function getOllamaClient(options: OpenAITextStreamOptions): Ollama {
  if (options.client) return options.client;
  if (options.turbo) return new Ollama({ host: 'https://ollama.com', headers: { Authorization: `Bearer ${options.turbo.apiKey}` } });
  if (options.host) return new Ollama({ host: options.host });
  return OllamaClient;
}
```

- [x] **Step 3: Use helper in `text()`**

Replace inline `turbo ? new Ollama(...) : OllamaClient` selection with `getOllamaClient(options)`.

- [x] **Step 4: Run tests and verify GREEN**

Run: `npx nx test ollama`

Expected: unit tests pass.

### Task 3: Update Integration Tests and Docs

**Files:**
- Modify: `packages/ollama/src/integration.spec.ts`
- Modify: `www/analog/src/app/pages/docs/react/platform/ollama.md`
- Modify: `www/analog/src/app/pages/docs/angular/platform/ollama.md`

- [x] **Step 1: Update e2e tests**

Replace the current pattern:

```ts
transformRequestOptions: (opts) => ({
  ...opts,
  ...(OLLAMA_HOST ? { host: OLLAMA_HOST } : {}),
}),
```

with top-level:

```ts
host: OLLAMA_HOST,
```

Keep existing `transformRequestOptions` only where it mutates real chat request options.

- [x] **Step 2: Update docs**

Document:

- `host?: string` for local/container Ollama.
- `client?: Ollama` for advanced SDK configuration.
- `turbo.apiKey` for Turbo.
- `transformRequestOptions` only changes chat request options.
- Default local behavior uses the default Ollama client; it does not claim to honor `OLLAMA_HOST`.

### Task 4: Verify and Publish

**Files:**
- All changed files.

- [x] **Step 1: Run package checks**

Run:

```sh
npx nx build ollama
npx nx test ollama
npx nx lint ollama
npx nx build-api-report ollama
```

- [x] **Step 2: Run docs checks**

Run:

```sh
npx nx build www
```

- [x] **Step 3: Run formatting guard**

Run: `git diff --check`

- [ ] **Step 4: Commit and open PR**

Commit implementation and docs. Push branch and open a PR for issue #471.

- [ ] **Step 5: Merge on green**

Monitor GitHub checks. If green, mark ready and squash-merge.
