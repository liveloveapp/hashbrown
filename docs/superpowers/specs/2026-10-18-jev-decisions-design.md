# Hashbrown Decisions: Typed Decisions and UI Selection (TypeSafe Jev)

Date: 2026-10-18
Status: design approved in conversation (brainstorm); awaiting written-spec review
Research:

- `docs/superpowers/research/jev-decisions/typesafe-jev-and-genui-specs.md`
- `docs/superpowers/research/jev-decisions/agui-decision-payload-events.md`

Follow-up (separate brainstorm): how the atc flagship example uses decisions, likely
in front of a natural-language map filter.

## Goal

Add **decisions** to Hashbrown: a non-streaming sibling of structured output for
*decision models*, models that answer typed questions with probabilities instead of
generating text. The first supported model is **Jev** from TypeSafe AI
(`api.typesafe.ai`, also on Vercel AI Gateway as `typesafe-ai/jev`).

Two capabilities, layered:

1. **Typed decisions.** The developer writes a Skillet schema of enumerations,
   booleans and bounded numbers and gets back a typed value plus per-field
   confidence in about 100 ms.
2. **UI selection.** A decision chooses which components to render, in two modes:
   **candidates** (app code fills props; no LLM) and **narrowing** (the decision
   picks components, then the existing streaming UI completion fills their props
   with a kit narrowed to the chosen components).

Success:

- A Skillet schema that a decision model cannot answer is a TypeScript error, not a
  runtime surprise.
- `useDecision` / `decisionResource` return a value whose type is inferred from the
  schema, and confidence data shaped like the schema.
- The core contract never mentions TypeSafe; Jev lives in one server adapter package.
- Keys stay on the server, and a server can pin the questions from its own schema.
- Narrowing mode keeps Hashbrown's streaming-props story: decide first, then stream.

## Background: what Jev is

A "System One" decision model. A request is `{ model, state, questions }`; each
question is **choice** (up to 255 options, returns `choice`, `probabilities`,
`confidence`), **score** (2 to 10 ordered levels, returns a probability-weighted
`score`, per-level probabilities and `confidence`) or **noul** (yes/no; returns a
`probability`). No streaming, no text generation, server-only with a secret key,
64k tokens per request. Questions in one request are evaluated in parallel and in
isolation against the same state. Documented weaknesses: counting, arithmetic,
numeric encodings such as hex, dates, double negatives, long irrelevant context,
and a bias toward the first-listed option. Model ids are versioned (`jev-1.13.0`,
`jev-1.14.0`) plus moving aliases (`jev-latest`, `jev-preview`). Details and sources
are in the research reports.

## Decisions

| Topic                 | Decision                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scope                 | Typed decisions and UI selection (both); decisions are the base layer                                         |
| UI selection props    | Both modes in one API: candidates (app-filled) and narrowing (LLM-filled after the decision)                  |
| Provider unit         | Vendor-neutral decision protocol in core; first adapter `@hashbrownai/typesafe`                               |
| Client API            | First-class `useDecision` / `decisionResource` and `useUiDecision` / `uiDecisionResource`                     |
| Schema restriction    | Compile-time `DecidableSchema`; number bounds checked at runtime                                              |
| Wire                  | Plain JSON request/response, not AG-UI                                                                         |
| Response shape        | A versioned envelope, `{ kind: 'hashbrown.decision', version: 1, value, meta, usage? }`, so an AG-UI transport can carry it later in `RUN_FINISHED.result` |
| Dependencies          | None new; the adapter uses global `fetch` (no `@typesafe-ai/sdk`)                                             |
| Model choice          | Server-side, pinned version, never `jev-latest` by default                                                    |
| AG-UI conformance     | Out of scope; handled in a separate session (cancelled outcome, `RUN_FINISHED.result`, `forwardedProps`)      |

## Architecture

```
React: useDecision, useUiDecision        Angular: decisionResource, uiDecisionResource
            └──────────────┬──────────────────────────┘
@hashbrownai/core   decision protocol, compiler, transport, runtime (vendor-neutral)
            │  POST DecisionRequest  →  DecisionResponse      (plain JSON, the app's endpoint)
app server ──► @hashbrownai/typesafe   HashbrownTypeSafe.decide(...) ──► api.typesafe.ai or Gateway /typesafe
```

Narrowing mode adds a second hop through the existing AG-UI UI completion path,
unchanged.

## 1. Core (`@hashbrownai/core`)

### Public, vendor-neutral

- **`DecidableSchema`**: the Skillet subset a decision model can answer.
  - `s.enumeration` → choice question.
  - `s.boolean` → yes/no question.
  - `s.number` / `s.integer` → score question (bounds checked at runtime, see below).
  - `s.object` whose properties are any of the above, nested to any depth.
  - `s.string`, `s.array`, `s.anyOf`, `s.nullish`, `s.literal`, `s.node` and all
    `s.streaming.*` types are rejected by the type.
- **Skillet addition: entry descriptions for enumerations.** Decision models use
  per-option descriptions to tell options apart. Add an overload that takes a
  record, `s.enumeration('Kind', { jet: 'Airliners and business jets', rotor: 'Helicopters' })`,
  inferring the same literal union as the array form. The array form is unchanged.
  In JSON Schema, an enumeration with entry descriptions is emitted as `oneOf` of
  `{ const, description }` (the array form keeps emitting `enum`), and
  `fromJsonSchema` reads that shape back into the record form.
- **Protocol types** (namespace `Decision`):
  - `Decision.Question`: `{ type: 'choice'; instructions; options: Record<string, string | null> }`
    | `{ type: 'score'; instructions; levels: Record<number, string> }`
    | `{ type: 'yesNo'; instructions }`.
  - `Decision.Request`: `{ state: string | JsonValue; questions: Record<string, Decision.Question>; options?: { longContext?: boolean } }`.
    No `model` field; the server chooses the model.
  - `Decision.Response`: `{ kind: 'hashbrown.decision'; version: 1; value: JsonValue; meta: Decision.MetaJson; usage?: { inputTokens: number; outputTokens: number } }`.
  - `Decision.Result<S>`: `{ value: s.Infer<S>; meta: Decision.Meta<S> }`.
  - `Decision.Meta<S>`: mirrors the schema's shape. Leaves are
    `{ confidence: number; probabilities: Record<option, number> }` for choice,
    `{ confidence: number; score: number; probabilities: Record<level, number> }` for
    score (`score` is the probability-weighted value, which can fall between levels;
    `value` holds the nearest level), and
    `{ probability: number }` for yes/no.
- **`DecisionTransport`**: `(request: Decision.Request, signal: AbortSignal) => Promise<Decision.Response>`.
- **`createHttpDecisionTransport({ url, middleware? })`**: POSTs JSON, applies
  `Chat.Middleware` to the `RequestInit` in declaration order (the same middleware
  type runs use), and maps non-2xx responses to `TransportError`.

### Internal, `ɵ`-prefixed (shared across packages)

- **`ɵcompileDecision(schema, options?)`** → `Decision.Request['questions']`. Pure.
  - Question ids are dotted property paths (`filter.altitude`).
  - Instructions come from the schema's descriptions; enumeration entries become
    options with their descriptions (or `null`).
  - Scores: bounds and `multipleOf` (integers default to step 1) must yield 2 to 10
    levels; otherwise throw `DecisionSchemaError` naming the path. Levels are the
    numeric values; their descriptions are generated (`"2 of 0 to 4"`) unless
    supplied later.
  - Limits enforced: at most 255 options per choice.
  - `optionOrder: 'declared' | 'shuffled'` (default `'declared'`). Shuffled
    randomizes option order per request to counter first-option bias; decoding is
    order-independent.
- **`ɵdecodeDecision(schema, response)`** → `Decision.Result<S>`. Validates the
  envelope (`kind`, `version`) and `value` with Skillet; throws
  `DecisionResponseError` on any mismatch, never returns a partial value.
- **`ɵcreateDecisionRuntime({ schema, transport, debounceTime, retries })`**:
  framework-free state machine behind the hooks: debounce, abort-on-new-input,
  stale-response discard by request id, retries on transport failure, status
  (`idle | loading | success | error`), `reload()`, `stop()`. Pure reducers for
  state, effects isolated.

Public API rule: React and Angular signatures reference only the public types
above, never `ɵ` types.

## 2. Server adapter: `@hashbrownai/typesafe`

New Nx library `packages/typesafe`, laid out like the existing adapters (build,
test, lint, e2e, build-api-report, nx-release-publish targets; release config).
Depends only on `@hashbrownai/core`.

```ts
const response = await HashbrownTypeSafe.decide({
  apiKey: process.env.TYPESAFE_API_KEY!,
  model: 'jev-1.14.0',
  request,                 // Decision.Request from the client
  schema,                  // optional; when set, questions are rebuilt server-side
  baseURL,                 // default 'https://api.typesafe.ai'; Gateway: 'https://ai-gateway.vercel.sh/typesafe'
  signal,
  transformRequest,        // optional escape hatch on the native request body
});
return Response.json(response);
```

Behaviour:

1. **Pinning.** With `schema`, questions come from `ɵcompileDecision(schema)` and
   the client's questions are ignored. Without it, the client's questions are
   validated against the protocol limits and a size cap.
2. **Dialect mapping.** Neutral → native: `yesNo` → `noul`; choice options →
   criteria; score levels → levels. POST `{baseURL}/v1/systemone` with a bearer
   key. Gateway's `/typesafe` passthrough uses the same dialect, so only `baseURL`
   changes.
3. **Response mapping.** Native answers → the `Decision.Response` envelope: `value`
   assembled from each answer (choice key, yes/no as `probability >= 0.5`, score as
   the nearest level), `meta` from probabilities and confidence, `usage` from the
   native usage fields.
4. **Retries and errors.** Retry 429 and 529 with capped backoff (max 2). Other
   failures throw `DecisionError` with `code` and `status`; the app maps it to an
   HTTP response.
5. **Model.** `model` is required. Docs recommend a pinned version.

Out of scope here: Gateway's `/v1/evaluate` dialect, `box` questions, the
long-context flag beyond passing `options.longContext` through.

## 3. React and Angular APIs

### Typed decisions

React:

```ts
const routing = useDecision({
  schema: s.object('Route', {
    intent: s.enumeration('What the user wants', { filter: '…', chat: '…' }),
    clear: s.boolean('The user wants to clear the current filter'),
  }),
  input: query,            // string | JsonValue | null; null keeps it idle
  system: 'You route questions in a flight-tracking app.',
  debounceTime: 150,
  transport,               // optional DecisionTransport override
  retries,
});
routing.value;             // { intent: 'filter' | 'chat'; clear: boolean } | null
routing.meta;              // Decision.Meta<typeof schema> | null
routing.isLoading; routing.error; routing.reload(); routing.stop();
```

Angular:

```ts
routing = decisionResource({ schema, input: this.query, system, debounceTime: 150 });
routing.value(); routing.meta(); routing.isLoading(); routing.error(); routing.reload(); routing.stop();
```

`input` is a value in React and a signal (or function) in Angular. `system` is
prepended to the state the model sees. Both wrap `ɵcreateDecisionRuntime`.

### UI selection

One API, two modes, selected by which option is present.

**Candidates mode** (`candidates`): app code supplies fully-propped candidates.

- React: `useUiDecision({ input, candidates: [{ id: 'flight', description: 'One aircraft', element: <FlightCard hex={sel} /> }, …], select: 'one' | { max: 3 }, minConfidence? })`
  returns `{ ui, ids, decision, isLoading, error, … }`, where `ui` is the chosen
  elements in order.
- Angular: candidates are `{ id, description, component, inputs }`;
  `uiDecisionResource(...)` exposes `ids()` and a `<hb-ui-decision [resource]>`
  outlet that renders the chosen components.
- Questions: `select: 'one'` → one choice over candidate ids; `select: { max }` →
  one yes/no per candidate, kept when `probability >= 0.5`, sorted by probability,
  capped at `max`.
- Ordered list only; no nested layout or slots in this phase.

**Narrowing mode** (`components` + `generate`): the decision picks exposed
components, then the existing UI completion streams their props.

- React: `useUiDecision({ input, components: [exposeComponent(...), …], select, minConfidence, generate: { system, transport?, debounceTime? } })`.
- Angular: `uiDecisionResource({ ... same ... })`.
- Phase 1: a decision over component names and descriptions (same question rules
  as candidates mode).
- Phase 2: `useUiCompletion` / `uiCompletionResource` runs with a kit containing
  only the chosen components (plus Markdown when included in `components`).
- Below `minConfidence`, or when phase 1 fails, phase 2 runs with the full kit and
  `decisionError` is exposed: decide when sure, generate everything otherwise.
- Result: `{ ui, decision, isDeciding, isGenerating, isLoading, error, decisionError, … }`
  plus the UI completion's existing fields.

### Configuration

`HashbrownProvider` / `provideHashbrown` gain `decision?: { url?: string; transport?: DecisionTransport }`.
Default URL `/api/decide`. Provider `middleware` applies to decision requests.
Every hook and resource accepts a `transport` override.

## 4. Errors

| Where            | Failure                                       | Behaviour                                                                 |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Type check       | Undecidable schema                            | TypeScript error                                                          |
| Compile          | Score bounds not giving 2 to 10 levels; >255 options | `DecisionSchemaError` with the field path (hook creation and server) |
| Transport        | Non-2xx, network                              | `TransportError` in `error`; retried per `retries`                        |
| Decode           | Wrong envelope or value fails Skillet         | `DecisionResponseError`; no partial value                                 |
| Runtime          | Input changes mid-flight                      | Abort; stale responses discarded                                          |
| Narrowing mode   | Phase 1 fails or is unsure                    | Phase 2 with the full kit; `decisionError` exposed                        |
| Narrowing mode   | Phase 2 fails                                 | Same as today's UI completion errors                                      |
| Adapter          | 429 / 529                                     | Capped retries, then `DecisionError`                                      |

## 5. Testing

Failing tests first; top-level `test(...)` with arrange/act/assert.

- **Core**: compiler and decoder for each Skillet type, nesting, limits, option
  shuffling; enumeration entry-description overload and its JSON Schema round trip;
  `DecidableSchema` type tests (accepts and rejects); `createHttpDecisionTransport`
  with a fake `fetch` (middleware order, error mapping); runtime debounce, abort,
  stale discard, retries.
- **typesafe**: native dialect mapping with recorded fixtures, pinning path, Gateway
  `baseURL`, retry and error mapping. A live e2e (`npx nx e2e typesafe`) runs only
  when `TYPESAFE_API_KEY` is set.
- **React / Angular**: hooks and resources against a fake `DecisionTransport`;
  candidates mode; narrowing mode with a fake decision then a mocked UI completion;
  low-confidence fallback.
- **Conformance** (`tools/conformance`): a decisions suite with a stub
  `/api/decide`, run against both frameworks' smoke hosts; no key needed.
- **API reports**: regenerate for core, react, angular and typesafe.

Before each PR: build, test and lint for every affected package, per AGENTS.md.

## 6. Docs (`www/content`)

- Concept page "Decisions" (React and Angular): when to decide versus generate,
  decidable schemas, confidence routing, server pinning, and model limits (bucket
  numbers in code; never pass hex codes or dates; option-order bias and
  `optionOrder: 'shuffled'`; include an `other` option).
- Recipe "UI selection": both modes, with the low-confidence fallback.
- Platform page `platform/typesafe`, plus entries in the API overview and the
  platforms list.
- Sidebar, sitemap count in `search-index.spec.ts`, and generated reference pages.

## 7. Delivery

Separate PRs, in order:

1. Core: protocol types, Skillet enumeration entry descriptions, `ɵ` compiler and
   decoder, `DecidableSchema`, HTTP decision transport, decision runtime.
2. `@hashbrownai/typesafe`.
3. React `useDecision` and Angular `decisionResource`, plus provider config.
4. `useUiDecision` and `uiDecisionResource`, both modes.
5. Docs and the conformance suite.

Then a separate brainstorm: atc's use of decisions.

## Non-goals for this phase (phase 2 candidates)

Keep these in mind when phase 1 lands; each gets its own brainstorm.

- **AG-UI `DecisionTransport`**: request in `forwardedProps.hashbrown.decision`,
  the same envelope in `RUN_FINISHED.result`, failures as `RUN_ERROR` with a
  namespaced code. Depends on the AG-UI 1.0 conformance work.
- **Gateway `/v1/evaluate` adapter**: vendor-neutral decision models (TypeSafe,
  Perplexity, Microsoft, Liquid, OpenAI) and Gateway's decision fallbacks.
- **Nested layout and slots in candidates mode** (json-render-style trees).
- **Jev `box` questions** (image bounding boxes).
- **Streaming decisions** (no current decision model streams).
- **Score level descriptions** supplied by the developer instead of generated.

## Risks

- **Vendor maturity.** Jev launched in early access on 2026-09-15; speed and cost
  figures are self-reported; the AI SDK API has already been renamed once. Mitigation:
  vendor-neutral core, a separately versioned adapter, pinned model versions.
- **Access.** Direct keys were waitlisted at launch; Gateway needs only a Gateway
  key. Unit and conformance tests need no key.
- **Accuracy on domain vocabulary** is untested; the atc follow-up should measure it
  before building on it.
- **Public API surface** grows by four hooks/resources and one package; the
  envelope's `version` field leaves room to evolve.
