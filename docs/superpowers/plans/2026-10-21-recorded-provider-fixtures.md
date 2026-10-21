# Recorded Provider Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back every provider's real-API-producible integration cases with fixtures recorded from the live API through aimock record mode. CI replays them strictly without keys, and `npx nx record-fixtures <provider>` re-records them.

**Architecture:**
- **Shared recording helper.** A small module in `tools/testing/aimock` decides record versus replay from env and starts aimock in the right mode. It supplies each test's `X-Test-Id` header and key, and scrubs secrets from recordings.
- **Provider specs.** Each spec moves its recordable cases onto that helper, with structural assertions. The cases about Hashbrown's own behaviour stay on hand-written fixtures.

**Tech Stack:** `@copilotkit/aimock` 1.45.1, Jest, Nx `run-commands` targets, and the provider SDKs already in the repo.

**Spec:** `docs/superpowers/specs/2026-10-21-recorded-provider-fixtures-design.md`. Read it first; it decides every behaviour here.

## Global Constraints

- **Dependencies.** Bump `@copilotkit/aimock` to exactly `1.45.1` in the root `package.json` and update the lockfile. Add no other dependency.
- **Credentials.**
  - Keys come only from `/Users/blove/repos/hashbrown/.env`. Never print them, never write them to a file other than that `.env`, and never commit them.
  - Implementing agents may make live recording calls with those keys (user decision).
  - Azure and Bedrock wait for credentials the user is adding. If they are missing when that task starts, report BLOCKED with the missing variable names.
- **Fixture files.**
  - Recorded fixtures live at `tools/testing/aimock/fixtures/recorded/<test-slug>/<provider>.json`. `<test-slug>` is aimock's `slugifyTestId` of the `X-Test-Id`.
  - Azure's recordings are named `openai.json`.
  - Fixtures are committed only after the secret scan passes.
- **Replay versus record.**
  - Replay is strict: `strict: true`, so a request with no fixture gets a 503 and the test fails.
  - Record mode is on only when `AIMOCK_RECORD=1`, and strict is off while recording.
- **Scrubbing.** After recording, every configured secret value is replaced with `[REDACTED]` in the written files.
- **What gets recorded.**
  - Recorded cases assert structure only: event types and order, roles, tool names, parsed tool arguments, reasoning presence, run completion, and non-empty text.
  - Hashbrown-behaviour cases stay on hand-written fixtures: provider errors, aborts, malformed streams, activity-callback ordering, and request-shape assertions.
- **Models.** Use the cheapest models that support each case:
  - OpenAI: `gpt-4.1-mini` for non-reasoning, `gpt-5-mini` for reasoning
  - Anthropic: the cheapest current thinking-capable Claude
  - Google: the cheapest Gemini with thinking
  - Ollama: `OLLAMA_MODEL`
  - Bedrock: `BEDROCK_MODEL_ID`
  - Azure: the user's deployments

  Cap output tokens where the API allows.
- **Repo rules.** Top-level `test(...)` with arrange/act/assert separated by blank lines. TSDoc on exported helpers. The failing test comes first for helper code.
- **Commit messages** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A missing recording in CI** must fail the test with a clear message naming the missing slug and provider. It must never pass or reach the network. Task 2 pins this.
2. **A key value in a recording** must be scrubbed before the file is committed, and the CI scan must catch one that slips through. Tasks 2 and 3 pin this.
3. **Re-recording one provider** must leave every other provider's files untouched. Task 4 pins this.
4. **Model wording changes after a re-record** must not break any recorded case. Tasks 5–10 pin this through structural assertions.
5. **The aimock 1.45 changed defaults** (for example `strictToolArguments`) must not break `tools/conformance` or `examples/atc/e2e`. Task 1 pins this.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `package-lock.json` | aimock 1.45.1 |
| `tools/testing/aimock/aimock-runner.ts` | `startAimock` gains `strict` and `record` options |
| `tools/testing/aimock/recording.ts` (new) | Env-driven record/replay helper: slug, headers, key choice, upstreams, scrub |
| `tools/testing/aimock/recorded-fixtures.spec.ts` (new) | Secret scan over committed recorded fixtures |
| `tools/testing/aimock/fixtures/recorded/**` (new) | Recorded fixtures |
| `tools/testing/README.md` (new, or `CONTRIBUTING.md` if preferred) | How to re-record |
| `packages/<provider>/project.json` | `record-fixtures` target |
| `packages/<provider>/src/integration.spec.ts` | Recordable cases moved to recorded fixtures with structural assertions |

---

### Task 1: Bump aimock to 1.45.1

**Files:** `package.json`, `package-lock.json`, plus any test that 1.45's changed defaults break.

- [ ] **Step 1: Bump the version.** Set `"@copilotkit/aimock": "1.45.1"` in the root `package.json` and run `npm install`. Use `npm ci` if the lockfile changes in an unexpected way.
- [ ] **Step 2: Run every aimock consumer.**

Run: `npx nx run-many -t test -p testing && npx nx run-many -t e2e -p openai azure anthropic bedrock google ollama && npx nx example-e2e conformance && npx nx e2e atc-e2e`
Expected: all pass. Fix any failure caused by changed defaults in the test setup, by setting the old behaviour explicitly in `startAimock` or the `LLMock` options. Do not weaken assertions. Record each fix in the report.
- [ ] **Step 3: Commit** `chore: bump aimock to 1.45.1`

---

### Task 2: Record mode in the aimock helper

**Files:**
- Modify: `tools/testing/aimock/aimock-runner.ts`, `tools/testing/aimock/aimock-runner.spec.ts`
- Create: `tools/testing/aimock/recording.ts`, `tools/testing/aimock/recording.spec.ts`
- Export both through `tools/testing/aimock/index.ts`

**Interfaces:**
- **Produces, in `aimock-runner.ts`:**
  ```ts
  export type AimockProvider = 'openai' | 'anthropic' | 'gemini' | 'bedrock' | 'ollama';
  export interface AimockRecordOptions {
    /** Upstream base URL per provider key. */
    readonly providers: Partial<Record<AimockProvider, string>>;
    /** Directory aimock writes recordings into (the `recorded` root). */
    readonly fixturePath: string;
    /** Values replaced with `[REDACTED]` in every file written during recording. */
    readonly secrets: readonly string[];
  }
  // AimockStartOptions gains:
  readonly strict?: boolean;
  readonly record?: AimockRecordOptions;
  ```
  - With `record` set, `startAimock` calls `mock.enableRecording({ providers, fixturePath, ... })` and turns strict off.
  - Its `stop()` scrubs every `.json` file written under `fixturePath` during the run, replacing each non-empty secret with `[REDACTED]`.
  - The loader also accepts a missing fixture path, as when a test has never been recorded, and starts with no fixtures.
- **Produces, in `recording.ts`:**
  ```ts
  export function isRecording(env?: NodeJS.ProcessEnv): boolean;                 // env.AIMOCK_RECORD === '1'
  export const RECORDED_FIXTURES_ROOT: string;                                    // absolute tools/testing/aimock/fixtures/recorded
  export function recordedTestSlug(testName: string): string;                     // aimock's slugifyTestId, or an identical copy
  export interface RecordedAimockOptions {
    readonly testName: string;                       // pass expect.getState().currentTestName
    readonly provider: AimockProvider;
    readonly upstream: string;                       // real base URL used only when recording
    readonly fileName?: string;                      // defaults to `${provider}.json` (Azure: 'openai.json')
    readonly secrets?: readonly string[];            // defaults to collectSecrets(process.env)
  }
  export interface RecordedAimock {
    readonly aimock: AimockHandle;
    readonly recording: boolean;
    readonly headers: Readonly<Record<string, string>>;   // { 'X-Test-Id': slug }
    apiKey(realKey: string | undefined): string;          // real key when recording, 'test-not-used' otherwise
  }
  export function startRecordedAimock(options: RecordedAimockOptions): Promise<RecordedAimock>;
  export function collectSecrets(env: NodeJS.ProcessEnv): string[];  // every non-empty value of *_KEY, *_SECRET*, *_TOKEN, AWS_*, *_ENDPOINT
  ```
  - **Replay:** `startRecordedAimock` loads `RECORDED_FIXTURES_ROOT/<slug>/<fileName>` with `strict: true`.
  - **Record:** it passes `record` with the single provider's upstream.

- [ ] **Step 1: Write the failing tests**
  - `test('isRecording is true only for AIMOCK_RECORD=1', …)`
  - `test('recordedTestSlug matches aimock slug for the same id', …)`
  - `test('collectSecrets returns every non-empty credential value', …)`
  - `test('strict replay fails a request with no fixture and names the test', …)`: Review Focus 1. Start `startRecordedAimock` for a slug with no file, then call the OpenAI endpoint with `fetch`. Expect a 503 and no outbound network call.
  - `test('stop scrubs configured secrets from recorded files', …)`: Review Focus 2. Write a fake recording containing a secret value into a temp `fixturePath`, then call `stop()`. The file must contain `[REDACTED]` and not the value.
  - `test('record options enable aimock recording with the provider upstream', …)`: point the upstream at a second local aimock acting as the real API, record one call, and confirm the file appears at `<slug>/<provider>.json`.
- [ ] **Step 2: Run the tests and confirm they fail.** `npx nx test testing` FAILS.
- [ ] **Step 3: Implement.** Use aimock's own exported slug helper if 1.45.1 exports one, otherwise copy it exactly.
- [ ] **Step 4: Run and confirm they pass:** `npx nx test testing && npx nx lint testing`.
- [ ] **Step 5: Commit** `test(testing): aimock record mode with strict replay and secret scrubbing`

---

### Task 3: Secret scan over committed recordings

**Files:** create `tools/testing/aimock/recorded-fixtures.spec.ts`.

- [ ] **Step 1: Write the scan.** `test('committed recorded fixtures contain no credentials', …)` walks `RECORDED_FIXTURES_ROOT`. It fails on:
  - any value from `collectSecrets` of the local `.env`, read only if the file exists and never printed (report only the file path and the variable *name* that matched);
  - key shapes: `sk-[A-Za-z0-9_-]{16,}`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{30,}`, `Bearer\s+[A-Za-z0-9._-]{20,}`, `x-api-key`, `authorization`.
- [ ] **Step 2: Prove the scan catches a planted fake.** Plant a fake `sk-…` value in a temp copy and run the scan's matcher function on it. Unit-test the matcher; do not commit the planted file.
- [ ] **Step 3: Run the checks:** `npx nx test testing && npx nx lint testing`. Both must PASS.
- [ ] **Step 4: Commit** `test(testing): scan recorded fixtures for credentials`

---

### Task 4: `record-fixtures` targets and docs

**Files:** `packages/{openai,azure,anthropic,google,bedrock,ollama}/project.json`; create `tools/testing/README.md`.

**Interfaces:** each `record-fixtures` target is `nx:run-commands`, which:
1. loads the root `.env` (`set -a; source ../../.env; set +a`, or Nx `envFile`);
2. deletes that provider's recorded files, through a small node script `tools/testing/aimock/clear-recordings.mjs <provider-file-name> [--slug-prefix <prefix>]` (Azure deletes by its test slugs, prefix `azure-`);
3. runs `AIMOCK_RECORD=1 npx nx e2e <provider> --skip-nx-cache`;
4. runs the Task 3 scan.

- [ ] **Step 1: Add the targets and the clear script.** Unit-test the script's file selection in `recording.spec.ts`: `test('clear-recordings removes only the given provider files', …)` (Review Focus 3).
- [ ] **Step 2: Write `tools/testing/README.md`.** Cover the command, the credentials each provider needs, the cost note, the review step, and the strict-replay behaviour.
- [ ] **Step 3: Run the checks:** `npx nx test testing && npx nx show project openai --json | grep record-fixtures`. Both must PASS or match.
- [ ] **Step 4: Commit** `build: record-fixtures targets for providers`

---

### Tasks 5–10: Convert each provider (one task per provider)

Same shape for each, in this order:
- Task 5: OpenAI
- Task 6: Anthropic
- Task 7: Google
- Task 8: Ollama
- Task 9: Azure
- Task 10: Bedrock

**Files:**
- `packages/<p>/src/integration.spec.ts`
- `tools/testing/aimock/fixtures/recorded/**/<p>.json` (Azure: `openai.json` under Azure slugs)
- delete hand-written fixtures in `tools/testing/aimock/fixtures/**` that no spec references any more

**Interfaces:**
- **Consumes** `startRecordedAimock`.
- **Provider wiring:**
  - pass the `headers` to the provider client (default headers or per-request options);
  - pass `apiKey(process.env[...])`;
  - point the base URL at `aimock` exactly as the spec does today.
- **Recordable cases:**
  - plain text;
  - multi-event streamed text;
  - tool call plus continuation after the result;
  - structured output;
  - full-history round trip;
  - reasoning and reasoning plus tool call: OpenAI, Azure, Anthropic, Google;
  - reasoning replay across a tool round trip: OpenAI, Azure.

  Each case gets its own unique prompt.

**Steps:**
- [ ] **Step 1: List the cases.** List the spec's tests as *recorded* or *hand-written* in the task report, using the Global Constraints rule.
- [ ] **Step 2: Rewrite the recorded tests to structural assertions** (Review Focus 4). Use one shared assertion helper per spec, e.g. `expectCanonicalTextRun(events)` and `expectToolRound(events, 'lookup')`.
- [ ] **Step 3: Record:** `npx nx record-fixtures <p>`. It must pass, and the scan must be clean.
- [ ] **Step 4: Replay with no keys:** `env -u <KEY…> npx nx e2e <p> --skip-nx-cache`. It must pass under strict replay.
- [ ] **Step 5: Delete hand-written fixtures that are now unused,** and re-run `npx nx e2e <p>`.
- [ ] **Step 6: Commit** `test(<p>): record live fixtures for integration cases`

**Provider-specific gates:**
- **Task 9 (Azure).**
  - Before Step 2, record one plain-text case and confirm the file lands at `<slug>/openai.json` and the request reached Azure with its `api-version`. If it didn't, report BLOCKED with the aimock request log.
  - Azure then replays its own recordings instead of OpenAI's.
  - If an Azure deployment returns no reasoning summaries, assert that an encrypted value is present instead.
- **Task 10 (Bedrock).**
  - Before Step 2, prove signing. Create the Bedrock client against the real regional endpoint, and add `finalizeRequest`-step middleware that rewrites the signed request's hostname, port and protocol to aimock's and then adds `X-Test-Id`.
  - Record one call. If AWS rejects the signature, report BLOCKED with the error. Do not convert other cases.
  - Wire this middleware only in the spec.

---

### Task 11: Whole-branch verification

- [ ] **Step 1: Replay everything without keys and confirm it passes**

Run: `env -i PATH="$PATH" HOME="$HOME" npx nx run-many -t e2e -p openai azure anthropic bedrock google ollama --skip-nx-cache && npx nx affected -t lint,test,typecheck,build --base=origin/main && npx nx example-e2e conformance && npx nx e2e atc-e2e`
Expected: all pass with no network access to providers.
- [ ] **Step 2: Confirm the secret scan passes and `git status` is clean.**
- [ ] **Step 3: Open the PR.** It lists the providers recorded, the models used, which tests stayed hand-written and why, the aimock bump and any default changes, and the re-record command.
