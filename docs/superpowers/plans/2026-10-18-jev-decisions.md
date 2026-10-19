# Hashbrown Decisions (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed decisions and UI selection to Hashbrown on a vendor-neutral, plain-JSON decision protocol, with `@hashbrownai/typesafe` (TypeSafe Jev) as the first server adapter.

**Architecture:** Core owns the protocol (types, a Skillet-to-questions compiler, a response decoder, an HTTP decision transport and a framework-free decision runtime). A new server-only adapter package maps the neutral protocol to TypeSafe's native API with `fetch`. React hooks and Angular resources wrap the core runtime; UI selection builds on decisions and, in narrowing mode, on the existing UI completion.

**Tech Stack:** TypeScript, Nx, Skillet (`s`), Jest (core, typesafe), Vitest (react, angular), Playwright (conformance), Next.js docs in `www/`.

**Spec:** `docs/superpowers/specs/2026-10-18-jev-decisions-design.md`

## Global Constraints

- No new npm dependencies in any package (the adapter uses global `fetch`; no `@typesafe-ai/sdk`).
- Anything shared across packages but not for end users is exported from core with the `ɵ` prefix; React and Angular public signatures never reference `ɵ` types.
- Every new public or reusable function, type and hook has a TSDoc block.
- Tests: write failing tests first; top-level `test(...)` only (no `describe`/`it`/`beforeEach`/`afterEach`); arrange/act/assert separated by blank lines.
- Response envelope: `{ kind: 'hashbrown.decision', version: 1, value, meta, usage? }`.
- Choice questions: at most 255 options. Score questions: 2 to 10 levels.
- Default decision endpoint URL: `/api/decide`.
- `HashbrownTypeSafe.decide` requires `model`; nothing defaults to `jev-latest`. Default `baseURL`: `https://api.typesafe.ai`; Gateway passthrough: `https://ai-gateway.vercel.sh/typesafe`. Native endpoint path: `/v1/systemone`.
- Adapter retries: 429 and 529 only, at most 2 retries, capped backoff.
- Yes/no answers decode to `true` when `probability >= 0.5`.
- Each PR: run build, test and lint for every affected package (and `build-api-report` for changed public packages) and report results.
- Phase 2 non-goals stay out: AG-UI `DecisionTransport`, Gateway `/v1/evaluate`, nested layout in candidates mode, `box` questions, streaming decisions, developer-supplied score level descriptions.

## Review Focus

- **Property names containing `.`** in a decidable object would collide with dotted question ids: the compiler must throw `DecisionSchemaError` naming the key (test in Task 3).
- **A response from an older input arriving after a newer request started** must never overwrite the newer value (test in Task 6).
- **Unmounting a component / destroying an injector mid-request** must abort the request and never update state afterwards (tests in Tasks 9 and 10).
- **The model answering a choice that is not among the options** (vendor drift) must surface as an error, not a value (test in Task 7).
- **A non-pinned server receiving an oversized or malformed client request** must reject it with `DecisionError` code `invalid_request` before calling the vendor (test in Task 8).

---

## PR 1: Core decision protocol

All paths relative to `packages/core/src/`. Run single specs with `npx nx test core -- --testPathPattern=<name>`.

### Task 1: Enumeration entry descriptions in Skillet

**Files:**
- Modify: `schema/base.ts` (`EnumTypeDefinition` ~1721, `EnumType` toJsonSchemaImpl ~1756, `enumeration` ~1810)
- Modify: `schema/from-json-schema.ts` (`parseEnum` ~204; dispatch ~106)
- Test: `schema/base.spec.ts` or a new `schema/enumeration-descriptions.spec.ts`, plus `schema/from-json-schema.spec.ts`

**Interfaces:**
- Produces: `s.enumeration(description, entries: Record<Entry, string>)` overload returning `EnumType<Entry[]>` (same literal union as the array form); `EnumTypeDefinition.entryDescriptions?: Readonly<Record<string, string>>`.

- [ ] **Step 1: Write failing tests**
  - `enumeration accepts a record of entry descriptions`: `s.enumeration('Kind', { jet: 'Jets', rotor: 'Helicopters' })` validates `'jet'`, rejects `'twin'`; a `// @ts-expect-error` on assigning `s.Infer<...>` to `'twin'`.
  - `enumeration with descriptions emits oneOf of const and description`: `s.toJsonSchema(...)` equals `{ type: 'string', description: 'Kind', oneOf: [{ const: 'jet', description: 'Jets' }, { const: 'rotor', description: 'Helicopters' }] }`.
  - `array enumeration still emits enum`: unchanged output.
  - `fromJsonSchema reads oneOf const entries into an enumeration with descriptions`: round trip equals the original JSON Schema.
- [ ] **Step 2: Run them; expect FAIL** (overload missing).
- [ ] **Step 3: Implement** the overload (`entries: [...Entries] | Record<string, string>`), store `entries` as the record's keys and `entryDescriptions`; emit `oneOf` when `entryDescriptions` is set; in `parseEnum`, accept a string schema whose `oneOf` items are all `{ const: string, description?: string }`. Streaming parse and validation keep using `entries`.
- [ ] **Step 4: Run `npx nx test core`; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): enumeration entry descriptions in Skillet`.

### Task 2: Decision protocol types and `DecidableSchema`

**Files:**
- Create: `decision/decision.types.ts`, `decision/decidable-schema.ts`, `decision/errors.ts`, `decision/public_api.ts`, `decision/index.ts`
- Modify: `public_api.ts` (add `export * from './decision';`)
- Test: `decision/decidable-schema.spec.ts`

**Interfaces:**
- Produces (namespace `Decision`, via `export * as Decision from './public_api'` in `decision/index.ts`):
  - `Decision.JsonValue` (re-export of `utils/types.ts` `JsonValue`)
  - `Decision.Question = { type: 'choice'; instructions: string; options: Record<string, string | null> } | { type: 'score'; instructions: string; levels: Record<string, string> } | { type: 'yesNo'; instructions: string }`
  - `Decision.Request = { state: string | JsonValue; questions: Record<string, Question>; options?: { longContext?: boolean } }`
  - `Decision.ChoiceMeta = { confidence: number; probabilities: Record<string, number> }`, `Decision.ScoreMeta = { confidence: number; score: number; probabilities: Record<string, number> }`, `Decision.YesNoMeta = { probability: number }`
  - `Decision.MetaJson = Record<string, ChoiceMeta | ScoreMeta | YesNoMeta>` (keyed by dotted question id)
  - `Decision.Response = { kind: 'hashbrown.decision'; version: 1; value: JsonValue; meta: MetaJson; usage?: { inputTokens: number; outputTokens: number } }`
  - `Decision.Meta<S>`: mapped type mirroring `S` (enum → `ChoiceMeta`, number/integer → `ScoreMeta`, boolean → `YesNoMeta`, object → nested)
  - `Decision.Result<S> = { value: s.Infer<S>; meta: Decision.Meta<S> }`
  - `Decision.Transport = (request: Request, signal: AbortSignal) => Promise<Response>`
- Produces (flat): `DecisionTransport` (alias of `Decision.Transport`, the name the spec and docs use), `DecidableSchema` (union of `s.EnumType<any>`, `s.BooleanType`, `s.NumberType`, `s.IntegerType`, and `s.ObjectType` whose shape values are `DecidableSchema`), `DecisionSchemaError`, `DecisionResponseError` (both `extends Error`, with `readonly path: string` on the schema error).

- [ ] **Step 1: Write failing type tests** in `decidable-schema.spec.ts`: a helper `function decidable<S extends DecidableSchema>(schema: S): S`; accepts enumeration, boolean, number, integer and nested objects; `// @ts-expect-error` for `s.string`, `s.array`, `s.anyOf`, `s.streaming.string` and an object containing a string; `Decision.Meta<typeof schema>` assigns `{ intent: { confidence: 1, probabilities: {} }, clear: { probability: 1 } }`.
- [ ] **Step 2: Run; expect FAIL** (types missing).
- [ ] **Step 3: Implement the types and errors** with TSDoc on each.
- [ ] **Step 4: Run `npx nx test core` and `npx nx build core`; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): decision protocol types and DecidableSchema`.

### Task 3: `ɵcompileDecision`

**Files:**
- Create: `decision/compile-decision.ts`
- Modify: `public_api.ts` (`export { compileDecision as ɵcompileDecision } from './decision/compile-decision';`)
- Test: `decision/compile-decision.spec.ts`

**Interfaces:**
- Consumes: Task 2 types; Task 1 `entryDescriptions`.
- Produces: `compileDecision(schema: DecidableSchema, options?: { optionOrder?: 'declared' | 'shuffled'; random?: () => number }): Record<string, Decision.Question>`.

- [ ] **Step 1: Write failing tests**
  - `compiles an enumeration to a choice with entry descriptions` → `{ intent: { type: 'choice', instructions: 'What the user wants', options: { filter: 'Filter the map', chat: null } } }` (array-form entries map to `null`).
  - `compiles a boolean to yesNo`.
  - `compiles a bounded integer to a score with generated levels`: `s.integer('Urgency', { minimum: 0, maximum: 4 })` → levels `{ '0': '0 of 0 to 4', …, '4': '4 of 0 to 4' }`.
  - `compiles a number with multipleOf to levels`: `{ minimum: 0, maximum: 1, multipleOf: 0.25 }` → 5 levels.
  - `flattens nested objects to dotted ids`: `{ filter: { altitude: enum } }` → key `filter.altitude`.
  - `throws DecisionSchemaError for unbounded or too many score levels` (missing `maximum`; 11 levels; `exclusiveMinimum` set; number without `multipleOf`), with `error.path` equal to the field path.
  - `throws for more than 255 options`.
  - `throws when a property name contains a dot` (Review Focus).
  - `shuffled option order is deterministic with an injected random and keeps all options`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** with the `s.is*Type` guards and `schema['~schema'].definition` (`shape`, `entries`, `entryDescriptions`, bounds). Instructions come from `s.getDescription`. Pure function; `random` defaults to `Math.random`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): compile decidable schemas to decision questions`.

### Task 4: `ɵdecodeDecision`

**Files:**
- Create: `decision/decode-decision.ts`
- Modify: `public_api.ts` (`ɵdecodeDecision`)
- Test: `decision/decode-decision.spec.ts`

**Interfaces:**
- Produces: `decodeDecision<S extends DecidableSchema>(schema: S, response: unknown): Decision.Result<S>`.

- [ ] **Step 1: Write failing tests**
  - `decodes a valid envelope into a typed value and nested meta` (dotted `meta` keys become nested objects matching the schema).
  - `rejects a wrong kind or version` → `DecisionResponseError`.
  - `rejects a value that fails Skillet validation` (enum value not in entries; score outside bounds) → `DecisionResponseError`.
  - `rejects meta missing a question id`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**: check envelope fields, `schema.validate(value)`, rebuild nested `meta` from dotted keys; never return partial results.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): decode decision responses`.

### Task 5: `createHttpDecisionTransport`

**Files:**
- Create: `decision/http-decision-transport.ts`
- Modify: `decision/public_api.ts` or root exports (flat export `createHttpDecisionTransport`, `HttpDecisionTransportOptions`)
- Test: `decision/http-decision-transport.spec.ts`

**Interfaces:**
- Produces: `createHttpDecisionTransport(options?: { url?: string; middleware?: Chat.Middleware[]; fetch?: typeof fetch }): Decision.Transport`; `url` defaults to `'/api/decide'`.

- [ ] **Step 1: Write failing tests** with a fake `fetch`: POSTs JSON with `Content-Type: application/json`; applies middleware in declaration order (second sees first's header); passes the abort signal; non-2xx → `TransportError` with `status` and `retryable: status >= 500 || status === 429`; network error → retryable `TransportError`; returns the parsed JSON body unchanged (decoding is the runtime's job).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): HTTP decision transport`.

### Task 6: `ɵcreateDecisionRuntime`

**Files:**
- Create: `decision/decision-runtime.ts`
- Modify: `public_api.ts` (`ɵcreateDecisionRuntime`, `ɵDecisionRuntime`, `ɵDecisionRuntimeState`)
- Test: `decision/decision-runtime.spec.ts`

**Interfaces:**
- Consumes: Tasks 3 to 5.
- Produces:
  ```ts
  interface DecisionRuntimeOptions<S extends DecidableSchema> {
    schema: S; transport: Decision.Transport; system?: string;
    debounceTime?: number; retries?: number; optionOrder?: 'declared' | 'shuffled';
  }
  interface DecisionRuntimeState<S> {
    status: 'idle' | 'loading' | 'success' | 'error';
    value: s.Infer<S> | null; meta: Decision.Meta<S> | null; error: Error | undefined;
  }
  interface DecisionRuntime<S> {
    getState(): DecisionRuntimeState<S>;
    subscribe(listener: () => void): () => void;
    setInput(input: string | Decision.JsonValue | null): void;
    reload(): boolean;   // false when there is no input
    stop(): void;        // aborts in-flight, keeps last value
    destroy(): void;     // aborts and drops listeners
  }
  function createDecisionRuntime<S extends DecidableSchema>(options: DecisionRuntimeOptions<S>): DecisionRuntime<S>;
  ```
  The request `state` is `input` when `system` is unset, otherwise `{ system, input }`. Questions are compiled once per runtime (shuffled order recompiles per request).

- [ ] **Step 1: Write failing tests** (Jest fake timers, fake transport):
  - `debounces input changes and sends one request`.
  - `a new input aborts the in-flight request`; `a late response from an older input never overwrites the newer value` (Review Focus).
  - `setInput(null) aborts and returns to idle with a null value`.
  - `retries retryable transport errors up to retries, then errors`; `non-retryable errors fail immediately`.
  - `decode errors set status error and keep value null`.
  - `stop keeps the last value; reload resends the last input`.
  - `destroy aborts and stops notifying`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** with a pure state reducer plus an effects section; abort via `AbortController`; `sleep` from `utils/async.ts`; stale guard by incrementing request id.
- [ ] **Step 4: Run `npx nx test core`, `npx nx lint core`, `npx nx build core`, `npx nx build-api-report core`; expect PASS** and an updated API report.
- [ ] **Step 5: Commit** `feat(core): framework-free decision runtime`, then open PR 1.

---

## PR 2: `@hashbrownai/typesafe`

### Task 7: Package scaffold and native dialect mapping

**Files:**
- Create: `packages/typesafe/{LICENSE,README.md,api-extractor.json,eslint.config.mjs,jest.config.ts,jest.e2e.config.ts,package.json,project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,tsconfig.docs.json}` copied from `packages/openai` with names changed; `package.json` deps `@hashbrownai/core` (peer, matching how openai depends on core) and `tslib` only, no `openai` peer.
- Create: `packages/typesafe/src/index.ts`, `src/native/to-native.ts`, `src/native/from-native.ts`, `src/native/native.types.ts`
- Modify: `nx.json` (`release.projects` and `release.version.preVersionCommand` list), `tsconfig.base.json` (`"@hashbrownai/typesafe": ["packages/typesafe/src/index.ts"]`), root `AGENTS.md` package list (build/test/e2e/lint/build-api-report/nx-release-publish for `typesafe`)
- Test: `src/native/to-native.spec.ts`, `src/native/from-native.spec.ts`, fixtures in `src/native/__fixtures__/`

**Interfaces:**
- Produces: `toNativeRequest(request: Decision.Request, model: string): NativeRequest`; `fromNativeResponse(native: NativeResponse, questions: Record<string, Decision.Question>): Decision.Response`.
- Native shapes (from the research report; confirm against `https://docs.typesafe.ai/api.md` before recording fixtures, and change only `native.types.ts` and the two mappers if they differ): request `{ model, state, questions: { [id]: { type: 'choice', instructions, criteria: Record<string, string | null> } | { type: 'score', instructions, levels: Record<string, string> } | { type: 'noul', instructions } } }`; response `{ answers: { [id]: { type: 'choice', choice, probabilities, confidence } | { type: 'score', score, probabilities, confidence } | { type: 'noul', noul: number } }, usage: { input_tokens, output_tokens } }`.

- [ ] **Step 1: Write failing tests**: `yesNo maps to noul`; `choice options map to criteria`; `long context passes through`; `choice answers map to value and ChoiceMeta`; `score answers take the nearest level for value and keep the weighted score in meta`; `noul maps to a boolean at 0.5 and YesNoMeta`; `usage maps to camelCase`; `an answer choice outside the question's options throws DecisionResponseError` (Review Focus); `a missing answer throws`.
- [ ] **Step 2: Run `npx nx test typesafe`; expect FAIL.**
- [ ] **Step 3: Scaffold the package and implement the mappers.**
- [ ] **Step 4: Run `npx nx test typesafe`, `npx nx lint typesafe`, `npx nx build typesafe`; expect PASS.**
- [ ] **Step 5: Commit** `feat(typesafe): package scaffold and native dialect mapping`.

### Task 8: `HashbrownTypeSafe.decide`

**Files:**
- Create: `packages/typesafe/src/decide.fn.ts`, `src/decision-error.ts`, `src/integration.spec.ts`
- Modify: `src/index.ts`, `README.md`
- Test: `src/decide.fn.spec.ts`

**Interfaces:**
- Consumes: Task 7 mappers; core `ɵcompileDecision`.
- Produces:
  ```ts
  interface TypeSafeDecideOptions {
    apiKey: string; model: string; request: unknown;
    schema?: DecidableSchema; baseURL?: string; signal?: AbortSignal;
    transformRequest?: (body: NativeRequest) => NativeRequest; fetch?: typeof fetch;
  }
  class DecisionError extends Error { readonly code: 'invalid_request' | 'unauthorized' | 'rate_limited' | 'upstream' | 'invalid_response'; readonly status: number; }
  export const HashbrownTypeSafe: { readonly decide: (options: TypeSafeDecideOptions) => Promise<Decision.Response> };
  ```

- [ ] **Step 1: Write failing tests** (fake `fetch`): `posts to {baseURL}/v1/systemone with a bearer key`; `Gateway baseURL changes only the host and path prefix`; `with schema, ignores client questions and compiles its own`; `without schema, rejects malformed requests, more than 255 options and requests over 64,000 characters of JSON with invalid_request and never calls fetch` (Review Focus); `retries 429 and 529 at most twice`; `maps 401 to unauthorized and other non-2xx to upstream`; `transformRequest edits the native body`; `requires model` (type-level `// @ts-expect-error`).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**, plus `integration.spec.ts` (runs under `npx nx e2e typesafe`) against a local `node:http` server that replays the recorded fixtures, and a live test that runs only when `TYPESAFE_API_KEY` is set (`test.skip` otherwise) with `model: 'jev-1.14.0'`. README: install, a Next.js route handler and a Node handler example, pinning, Gateway `baseURL`.
- [ ] **Step 4: Run `npx nx test typesafe`, `npx nx e2e typesafe`, `npx nx lint typesafe`, `npx nx build typesafe`, `npx nx build-api-report typesafe`; expect PASS.**
- [ ] **Step 5: Commit** `feat(typesafe): decide with pinning, retries and errors`, then open PR 2.

---

## PR 3: Framework APIs for typed decisions

### Task 9: React `useDecision` and provider config

**Files:**
- Modify: `packages/react/src/hashbrown-provider.tsx` (props add `decision?: { url?: string; transport?: Decision.Transport }`; context value adds `decisionTransport: Decision.Transport` built with `createHttpDecisionTransport({ url: decision?.url, middleware })` unless `decision.transport` is given)
- Create: `packages/react/src/hooks/use-decision.tsx`
- Modify: `packages/react/src/public-api.ts`
- Test: `packages/react/src/hooks/use-decision.spec.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface UseDecisionOptions<S extends DecidableSchema> {
    schema: S; input: string | Decision.JsonValue | null | undefined; system?: string;
    debounceTime?: number; retries?: number; transport?: Decision.Transport; optionOrder?: 'declared' | 'shuffled';
  }
  interface UseDecisionResult<S extends DecidableSchema> {
    value: s.Infer<S> | null; meta: Decision.Meta<S> | null; isLoading: boolean;
    error: Error | undefined; reload: () => boolean; stop: () => void;
  }
  function useDecision<S extends DecidableSchema>(options: UseDecisionOptions<S>): UseDecisionResult<S>;
  ```
  Uses `useSyncExternalStore` over `ɵcreateDecisionRuntime`; the runtime is recreated only when the serialized schema, transport or system change; `input` changes call `setInput`.

- [ ] **Step 1: Write failing tests** with `renderHook` inside `HashbrownProvider decision={{ transport: fake }}`: `returns a typed value and meta`; `uses the provider's decision transport and the hook override wins`; `default transport posts to /api/decide with provider middleware`; `input changes re-decide; null input is idle`; `unmounting mid-request aborts and never updates` (Review Focus).
- [ ] **Step 2: Run `npx nx test react -- src/hooks/use-decision.spec.tsx`; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx nx test react`, `npx nx run react:eslint:lint`, `npx nx build react`, `npx nx build-api-report react`; expect PASS.**
- [ ] **Step 5: Commit** `feat(react): useDecision`.

### Task 10: Angular `decisionResource` and provider config

**Files:**
- Modify: `packages/angular/src/providers/provide-hashbrown.fn.ts` (`ProvideHashbrownOptions.decision?: { url?: string; transport?: Decision.Transport }`)
- Create: `packages/angular/src/resources/decision-resource.fn.ts`
- Modify: `packages/angular/src/resources/index.ts` (or the barrel `public_api.ts` uses)
- Test: `packages/angular/src/resources/decision-resource.fn.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DecisionResourceOptions<S extends DecidableSchema> {
    schema: S; input: Signal<string | Decision.JsonValue | null | undefined>; system?: ReactiveOption<string>;
    debounce?: number; retries?: number; transport?: Decision.Transport; optionOrder?: 'declared' | 'shuffled';
  }
  interface DecisionResourceRef<S extends DecidableSchema> {
    value: Signal<s.Infer<S> | null>; meta: Signal<Decision.Meta<S> | null>; isLoading: Signal<boolean>;
    error: Signal<Error | undefined>; reload: () => boolean; stop: () => void;
  }
  function decisionResource<S extends DecidableSchema>(options: DecisionResourceOptions<S>): DecisionResourceRef<S>;
  ```
  Option names follow Angular's existing resources (`debounce`, `ReactiveOption`). The transport is `options.transport ?? config.decision?.transport ?? createHttpDecisionTransport({ url: config.decision?.url, middleware: config.middleware })`, with `config` from `ɵinjectHashbrownConfig()`. An `effect` feeds `input` to `setInput`; `DestroyRef.onDestroy` calls `destroy`.

- [ ] **Step 1: Write failing tests** with `TestBed.runInInjectionContext`: the same cases as Task 9, including `destroying the injector mid-request aborts and never updates` (Review Focus).
- [ ] **Step 2: Run `npx nx test angular -- decision-resource`; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx nx test angular`, `npx nx lint angular`, `npx nx build angular`, `npx nx build-api-report angular`; expect PASS.**
- [ ] **Step 5: Commit** `feat(angular): decisionResource`, then open PR 3.

---

## PR 4: UI selection

### Task 11: Core selection helpers

**Files:**
- Create: `packages/core/src/decision/ui-selection.ts`
- Modify: `packages/core/src/public_api.ts` (`ɵcreateSelectionSchema`, `ɵresolveSelection`, public type `Decision.Select`)
- Test: `packages/core/src/decision/ui-selection.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  type Select = 'one' | { max: number };     // exported as Decision.Select
  function createSelectionSchema(options: ReadonlyArray<{ id: string; description: string }>, select: Select): DecidableSchema;
  // 'one'  → s.object('Selection', { pick: s.enumeration('Which one fits the input best', { [id]: description }) })
  // {max}  → s.object('Selection', { [id]: s.boolean(`Does this fit the input: ${description}`) })
  function resolveSelection(result: Decision.Result<DecidableSchema>, select: Select, minConfidence?: number): { ids: string[]; confident: boolean };
  ```
  `{ max }` keeps ids with `probability >= 0.5`, sorted by probability descending, capped at `max`; `confident` is false when the best confidence or probability is below `minConfidence` (default 0). Ids containing `.` throw `DecisionSchemaError`.

- [ ] **Step 1: Write failing tests** for both select modes, sorting, the cap, the confidence flag and dotted ids.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.** **Step 4: Run `npx nx test core`; expect PASS.**
- [ ] **Step 5: Commit** `feat(core): UI selection helpers`.

### Task 12: React `useUiDecision`

**Files:**
- Create: `packages/react/src/hooks/use-ui-decision.tsx`
- Modify: `packages/react/src/public-api.ts`
- Test: `packages/react/src/hooks/use-ui-decision.spec.tsx`

**Interfaces:**
- Consumes: Task 11; `useDecision` (Task 9); `useUiCompletion` (existing, `use-ui-completion.tsx`).
- Produces two overloads of `useUiDecision`:
  - Candidates: options `{ input; candidates: Array<{ id: string; description: string; element: ReactElement }>; select: Decision.Select; minConfidence?; transport? }` → `{ ui: ReactElement[]; ids: string[]; decision: UseDecisionResult<…>; isLoading; error }`.
  - Narrowing: options `{ input; components: UiKitInput<ExposedComponent<any>>[]; select; minConfidence?; transport?; generate: { system: string | SystemPrompt; transport?: TransportOrFactory; debounceTime?: number } }` → `{ ui: ReactElement[] | null; decision; isDeciding; isGenerating; isLoading; error; decisionError }` plus the UI completion fields. Phase 2 runs `useUiCompletion` with the chosen components only; it waits for phase 1 to settle; when `confident` is false or phase 1 errors it uses all `components` and sets `decisionError` for errors.

- [ ] **Step 1: Write failing tests**: candidates `'one'` renders only the chosen element; `{ max: 2 }` renders in probability order; narrowing passes only the chosen components to the UI completion (mock `useUiCompletion` and assert its `components`); low confidence passes all components; a phase 1 error passes all components and exposes `decisionError`.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.** **Step 4: Run `npx nx test react`, lint, build, `build-api-report react`; expect PASS.**
- [ ] **Step 5: Commit** `feat(react): useUiDecision`.

### Task 13: Angular `uiDecisionResource` and `hb-ui-decision`

**Files:**
- Create: `packages/angular/src/resources/ui-decision-resource.fn.ts`, `packages/angular/src/components/ui-decision.component.ts`
- Modify: the resources and components barrels
- Test: `packages/angular/src/resources/ui-decision-resource.spec.ts`, `packages/angular/src/components/ui-decision.component.spec.ts`

**Interfaces:**
- Consumes: Task 11; `decisionResource` (Task 10); `uiCompletionResource` (existing).
- Produces: `uiDecisionResource` with the same two modes as Task 12. Candidates are `{ id; description; component: Type<unknown>; inputs?: Record<string, unknown> }`; the ref exposes `ids()`, `decision`, `isLoading()`, `error()`, and for narrowing `value()` (the UI completion's), `isDeciding()`, `isGenerating()`, `decisionError()`. `UiDecisionComponent` (selector `hb-ui-decision`, input `resource`) renders chosen candidates in order with `NgComponentOutlet`; for narrowing it delegates to `hb-render-message`.

- [ ] **Step 1: Write failing tests** mirroring Task 12 (mock `./ui-completion-resource.fn` with `vi.mock`, as `ui-completion-resource.spec.ts` does), plus `hb-ui-decision renders chosen candidates in order with their inputs`.
- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.** **Step 4: Run `npx nx test angular`, lint, build, `build-api-report angular`; expect PASS.**
- [ ] **Step 5: Commit** `feat(angular): uiDecisionResource and hb-ui-decision`, then open PR 4.

---

## PR 5: Conformance and docs

### Task 14: Conformance decisions suite

**Files:**
- Modify: `tools/conformance/harness/browser.ts` (`RuntimeSmokeScenario` adds `'decision'`)
- Create: `tools/conformance/hosts/react/src/decision-smoke.tsx`, `tools/conformance/hosts/angular/src/app/decision-smoke.ts`
- Modify: both hosts' `app` scenario switch
- Create: `tools/conformance/specs/decisions.spec.ts`

**Interfaces:**
- Each host renders a `useDecision` / `decisionResource` with `s.object('Route', { intent: s.enumeration('Intent', { filter: 'Filter', chat: 'Chat' }), clear: s.boolean('Clear') })`, an input box, and `data-testid` outputs `decision-intent`, `decision-clear`, `decision-confidence`, `decision-error`; plus a candidates-mode `useUiDecision` / `hb-ui-decision` block with two candidates.
- The spec stubs `**/api/decide` with Playwright `page.route` (no aimock; decisions are plain JSON).

- [ ] **Step 1: Write the failing spec**: typing an input yields `filter`, `false` and the confidence from the stub; the stub saw exactly the compiled questions; a 500 shows `decision-error`; candidates mode shows only the chosen candidate. Runs for both projects.
- [ ] **Step 2: Run `npx nx conformance-e2e conformance`; expect FAIL.** **Step 3: Implement the hosts.** **Step 4: Run `npx nx conformance-e2e conformance`, `npx nx lint conformance`, `npx nx build conformance`; expect PASS.**
- [ ] **Step 5: Commit** `test(conformance): decisions suite for Angular and React`.

### Task 15: Docs

**Files:**
- Create: `www/content/docs/{react,angular}/concept/decisions.md`, `www/content/docs/{react,angular}/recipes/ui-selection.md`, `www/content/docs/{react,angular}/platform/typesafe.md`
- Modify: `www/src/components/menus/docs-menu.data.ts` (Guide: Decisions after Structured Output; Recipes: UI Selection; Platforms: TypeSafe), `www/content/docs/{react,angular}/start/platforms.md`, `www/content/docs/{react,angular}/start/overview.md` ("Choosing a Hook" rows for `useDecision` / `useUiDecision` and `decisionResource` / `uiDecisionResource`), `www/test/search/search-index.spec.ts:62` (`79` → `85`), `www/project.json` (add `typesafe` to the `build-api-report` dependency lists that include `openai`)

Content per spec section 6: when to decide versus generate; decidable schemas and the enumeration record form; confidence routing; server pinning with `schema`; model limits (bucket numbers in code, never pass hex codes or dates, option-order bias and `optionOrder: 'shuffled'`, include an `other` option); both UI selection modes with the low-confidence fallback; the TypeSafe route handler and Gateway `baseURL`.

- [ ] **Step 1: Update `search-index.spec.ts` to 85 and run `npx nx test www`; expect FAIL.**
- [ ] **Step 2: Write the six pages and the menu, platforms and overview entries.**
- [ ] **Step 3: Run `npx nx test www`, `npx nx lint www`, `npx nx build www`, `npx nx e2e www`; expect PASS.**
- [ ] **Step 4: Commit** `docs: decisions, UI selection and the TypeSafe platform`, then open PR 5.
