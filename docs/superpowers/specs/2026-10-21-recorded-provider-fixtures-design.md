# Recorded provider fixtures

Status: design, awaiting approval (2026-10-21)

## Intent

Each provider has aimock integration specs (`packages/<provider>/src/integration.spec.ts`). They run on hand-written fixtures in `tools/testing/aimock/fixtures/**`, which describe responses in aimock's own format. Nothing checks those fixtures against what real provider APIs send. For example, the OpenAI Responses work and the activities work (#667, #669) were tested only on hand-written fixtures. The one live check, the key-gated `live.integration.spec.ts`, exists for OpenAI and Azure only and is skipped in CI.

This design replaces the hand-written fixtures behind each provider's integration cases with fixtures **recorded from the real API** through aimock's record mode:

- CI replays the recordings without keys.
- A developer re-records on demand with their own keys.

This is the user's decision, as is the fidelity level: real content with the stream rebuilt from it, not exact bytes. aimock collapses each recorded stream into a provider-neutral fixture and rebuilds the provider's events on replay.

## Goals

1. **All six providers record.** OpenAI (Responses API), Azure OpenAI (Responses API), Anthropic, Google, Bedrock and Ollama each have their integration cases backed by recorded fixtures. The user decided all six are in scope and will supply keys and credentials.
2. **Record mode in the shared helper.**
   - `startAimock` (`tools/testing/aimock/aimock-runner.ts`) gains a record mode, switched on by an env flag.
   - When it is on, aimock proxies a request with no fixture to the real provider and saves the result.
   - When it is off, replay is strict: a request with no fixture fails the test. It never reaches the network, and it never falls back to a hand-written fixture.
3. **Stable fixture files.**
   - Each recorded test sends an `X-Test-Id` header, so recordings land at `tools/testing/aimock/fixtures/recorded/<test-slug>/<provider>.json`.
   - Re-recording a test replaces its file. It does not append and it does not create a timestamped file.
4. **One command per provider.** `npx nx record-fixtures <provider>`:
   - loads the root `.env`;
   - turns on record mode;
   - clears that provider's recorded files;
   - runs that provider's integration spec.
5. **No secrets in fixtures.** This design's call: aimock's `AIMOCK_RECORD_SECRET_VALUES` covers MCP recording only, so it does not help here.
   - `startAimock` scrubs every recorded file after aimock writes it, replacing any configured secret value with `[REDACTED]`.
   - An in-repo scan runs after recording and in CI.
   - aimock's LLM recordings already contain no request headers (`recorder.js:1229-1249`).
6. **Assertions check structure, not text.** The recorded cases check event types and order, roles, tool names and parsed tool arguments, that reasoning events are present where the case expects them, and run completion. Text is checked only for being non-empty.
7. **aimock bumped to 1.45.1** (user decision). This is the root `package.json` `@copilotkit/aimock` pin. Every aimock consumer keeps passing: provider specs, `tools/testing`, `tools/conformance`, and `examples/atc/e2e`.

## Non-goals

- **Byte-exact replay** of recorded SSE. aimock cannot do this; it rebuilds streams. The key-gated live tests stay as the only check against real wire bytes.
- **Recording `tools/conformance` or `examples/atc/e2e`.** They keep their scripted `LLMock` fixtures; only the version bump touches them.
- **Recording Hashbrown-behaviour cases.** These stay hand-written: provider errors, cancellation and abort timing, malformed streams, the activity callback ordering, and request-shape assertions that need exact responses. A real API won't produce them on demand.
- **Re-recording in CI**, and nightly drift jobs. Re-recording is manual.
- **Replacing the key-gated live tests.** They stay as they are.

## Anti-goals

- A committed fixture contains an API key, credential, session token or account identifier.
- A replay run makes a network call to a real provider.
- A test passes because a recording is missing. Strict replay must fail instead.
- Re-recording a single provider changes another provider's fixtures.
- A recorded case becomes flaky because it asserts on model wording.

## Constraints

- **Repo rules.** Follow AGENTS.md: top-level `test(...)` with arrange/act/assert, failing test first for helper changes, TSDoc on reusable helpers. The aimock bump is the only dependency change.
- **Credentials.** Keys come from the root `.env` (`/Users/blove/repos/hashbrown/.env`), never from committed files. The user will add the missing ones:
  - an Azure resource with Responses support (`AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_API_VERSION`, plus deployments for a reasoning model and a non-reasoning model);
  - AWS credentials for Bedrock (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or a named profile) with access to `BEDROCK_MODEL_ID` in `BEDROCK_REGION`.
- **Live recording during the build** (user decision): implementing agents may run live recordings with the root `.env` keys and commit the recordings once they pass the secret scan. Each provider is done end to end: record, write structural assertions, replay, commit. Azure and Bedrock wait until the user adds their credentials. If those credentials are missing when their turn comes, stop and report.
- **aimock 1.45.1 stays** (user decision), even though its secret redaction covers MCP only. Every aimock consumer must keep passing. Watch for 1.45.0's changed defaults, such as `strictToolArguments`.
- **Ollama** records against the local server at `OLLAMA_HOST` with `OLLAMA_MODEL`.
- **Models.** Recordings use small, cheap models per provider, with output caps where the API allows them.

## Decisions

### Record mode

- **Option.** `AimockStartOptions` gains `record?: { providers: Partial<Record<AimockProvider, string>>; fixturePath: string }`. When it is set, `startAimock` calls `mock.enableRecording({ providers, fixturePath, ... })` with the 1.45 options:
  - redaction values;
  - body timeouts long enough for reasoning models.
- **Env flag.** `AIMOCK_RECORD=1` turns record mode on in the specs' shared setup. The specs read upstream URLs from env with real defaults:
  - OpenAI `https://api.openai.com`
  - Anthropic `https://api.anthropic.com`
  - Gemini `https://generativelanguage.googleapis.com`
  - Bedrock `https://bedrock-runtime.<region>.amazonaws.com`
  - Ollama `OLLAMA_HOST`
  - Azure `AZURE_ENDPOINT`
- **Keys.**
  - **Record mode:** each spec passes the real key from env to its provider client, as it does in the live specs.
  - **Replay mode:** the key stays `'test-not-used'`.
  - **Alternative:** if aimock's `AIMOCK_PROVIDER_*_KEY` injection with a `sk-aimock-…` dummy is cleaner, the builder may use it instead.
- **Strict replay.** Set `strict: true` in replay mode, so aimock returns 503 when no fixture matches and the test fails visibly. Strict mode must be off while recording, because the strict check runs before the record branch.
- **Appending.** aimock adds to an existing recording rather than replacing it, so the delete step in `record-fixtures` is what makes a re-record replace the file.

### Fixture layout and matching

- **Location.** Recorded fixtures live in `tools/testing/aimock/fixtures/recorded/<test-slug>/<provider>.json`. The slug comes from the test name through `X-Test-Id`. Each provider client's default headers carry it, set per test.
- **Matching** uses aimock's recorded `match`: last user message, normalized model, `turnIndex` and `hasToolResult`. To stop collisions between tests, each recorded case uses a unique user prompt, and replay loads only that test's fixture file.
- **Hand-written fixtures** stay only for the non-goal cases. Delete any that become unused.

### Which cases are recorded

For each provider, record the cases its current integration spec runs that a real API can produce:
- plain text;
- streamed text across several events;
- one tool call, then a continuation after the tool result;
- structured output (`responseSchema`);
- a full-history round trip.

Also record:
- **OpenAI, Azure, Anthropic and Google:** reasoning, plus reasoning followed by a tool call.
- **OpenAI and Azure:** a reasoning replay across a tool round trip.

The builder lists the exact cases per provider in the plan from each spec.

### Provider specifics

- **Azure.**
  - Record through aimock's `openai` provider route, with its upstream set to `AZURE_ENDPOINT`. The path `/openai/responses` and the `api-version` query must reach Azure unchanged. Verify this first.
  - If the route can't record Azure, report it before going further.
  - Azure recordings are saved as `<slug>/openai.json`, because aimock records under the provider key `openai`. The Azure target's delete step must target the Azure tests' slugs instead.
  - Once Azure recordings exist, Azure replays its own instead of sharing OpenAI's.
- **Bedrock.** The SDK signs SigV4 for the host it sends to.
  - Sign for the real regional endpoint, then redirect the signed request to aimock after signing, using a custom request handler or `finalizeRequest` middleware in the spec's setup only.
  - aimock forwards the request unchanged to AWS, so the signature stays valid.
  - aimock strips `X-Test-Id` before forwarding, so the header must be added after signing. Otherwise it would be part of the signed headers.
  - Prove this with one recorded call before converting the other Bedrock cases.
  - If it can't be made to work, stop and report. Bedrock then keeps its hand-written fixtures, and this goal is reopened with the user.
- **Google.** Thought signatures may be missing from recordings, which is a known aimock limitation. Assertions must not depend on them.
- **OpenAI and Azure.** Recording keeps reasoning only from summary events. The OpenAI account in `.env` returned summaries for `gpt-5-mini` in #667's live tests. If an Azure deployment returns no summaries, its reasoning cases assert an encrypted value instead. Replay rebuilds `encrypted_content` as a fake value. Replay assertions check that reasoning comes back with an encrypted value, not its exact content.

### The command

- **Target.** Add a `record-fixtures` target to each provider's `project.json`. It loads the root `.env`, sets `AIMOCK_RECORD=1`, removes `tools/testing/aimock/fixtures/recorded/*/<provider>.json`, and runs that provider's integration spec.
- **Recordings stay uncommitted.** The command leaves them in the working tree for review. A human or the implementing agent commits them after the secret scan passes.
- **Docs.** Document the command, the credentials each provider needs, and the review step (check the diff for secrets and odd output) in the repo's contributor docs: `CONTRIBUTING.md` or `tools/testing/README.md`, whichever exists.

## Testing

- **Unit tests for the record-mode helper** (`aimock-runner.spec.ts`):
  - record options are passed to aimock;
  - strict replay fails a request with no fixture;
  - the `X-Test-Id` path is stable.
- **Secret check.** A spec in `tools/testing` scans every committed recorded fixture for any non-empty value from the developer's `.env`, when one exists locally. It also scans for common key shapes (`sk-`, `AKIA`, `AIza`, `Bearer`), and fails on a match. It runs in CI against the committed fixtures.
- **Replay checks.** Every provider's integration spec passes under `npx nx e2e <provider>` with no keys and record mode off. Every aimock consumer passes after the bump: `npx nx run-many -t e2e -p openai azure anthropic bedrock google ollama`, `npx nx test testing`, `npx nx example-e2e conformance`, `npx nx e2e atc-e2e`.

## Left to the builder

- The exact aimock 1.45 options for strict replay and redaction, and the timeouts.
- Whether to pass keys directly or through aimock's provider-key injection.
- The test-slug function and how `X-Test-Id` reaches each provider SDK.
- The exact list of recorded cases per provider, chosen from each existing spec.
- The order of providers. The suggested order is OpenAI, Anthropic, Google, Ollama, then Azure and Bedrock once credentials arrive.
