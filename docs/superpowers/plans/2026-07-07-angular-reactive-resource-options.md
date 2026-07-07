# Angular Reactive Resource Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Angular chat and completion resources consistently accept Angular `Signal<T>` values for `model`, `apiUrl`, `system`, and `threadId`, and update the existing Hashbrown runtime when those values change.

**Architecture:** Add a public Angular `ReactiveOption<T> = T | Signal<T>` helper and use it in resource option types. Root resources that own a `fryHashbrown(...)` runtime read reactive option values at initialization and from an Angular `effect()` that calls `hashbrown.updateOptions(...)`. Wrapper resources pass reactive options through to the root resource instead of unwrapping them.

**Tech Stack:** Angular signals/resources, TypeScript, Vitest, Nx, Hashbrown core `fryHashbrown` runtime.

---

## File Structure

- Modify `packages/angular/src/utils/types.ts`
  - Add and export `ReactiveOption<T>`.
  - Keep `SignalLike<T>` backward compatible unless the implementation can safely migrate all users.
- Modify `packages/angular/src/utils/signals.ts`
  - Reuse `readSignalLike()` for `ReactiveOption<T>` values.
  - Do not document callback functions as public API.
- Modify `packages/angular/src/resources/chat-resource.fn.ts`
  - Use `ReactiveOption<T>` for `model`, `apiUrl`, `system`, and `threadId`.
  - Add runtime option update effect.
- Modify `packages/angular/src/resources/completion-resource.fn.ts`
  - Use `ReactiveOption<T>` for `model`, `apiUrl`, `system`, and `threadId`.
  - Add runtime option update effect without breaking input-to-message behavior.
- Modify `packages/angular/src/resources/structured-chat-resource.fn.ts`
  - Use `ReactiveOption<T>` for `model`, `apiUrl`, `system`, and `threadId`.
  - Fix existing effect to read reactive values and include `apiUrl`.
- Modify `packages/angular/src/resources/structured-completion-resource.fn.ts`
  - Use `ReactiveOption<T>` in public options.
  - Pass reactive options through to `structuredChatResource()`.
- Modify `packages/angular/src/resources/ui-chat-resource.fn.ts`
  - Use `ReactiveOption<T>` in public options.
  - Keep `systemAsString` as a computed value and pass reactive `model`, `apiUrl`, and `threadId` through.
- Modify `packages/angular/src/resources/ui-completion-resource.fn.ts`
  - Use `ReactiveOption<T>` in public options.
  - Keep `systemAsString` as a computed value and pass reactive `model`, `apiUrl`, and `threadId` through.
- Modify `packages/angular/src/resources/chat-resource.fn.spec.ts`
  - Add focused tests for reactive runtime options.
- Create or modify `packages/angular/src/resources/completion-resource.fn.spec.ts`
  - Add focused tests for reactive runtime options.
- Modify `packages/angular/src/resources/structured-chat-resource.fn.spec.ts`
  - Add focused tests for reactive runtime options.
- Modify `packages/angular/src/resources/ui-chat-resource.spec.ts`
  - Assert wrapper pass-through of reactive options.
- Modify `packages/angular/src/resources/ui-completion-resource.spec.ts`
  - Assert wrapper pass-through of reactive options.
- Modify Angular docs under `www/analog/src/app/pages/docs/angular/**` only if API report/docs generation shows resource option pages need source examples beyond TSDoc.

## Task 1: Add Public Reactive Option Type

**Files:**
- Modify: `packages/angular/src/utils/types.ts`
- Read: `packages/angular/src/utils/index.ts`
- Test through later type/build checks.

- [ ] **Step 1: Add the type**

Add a public TSDoc block and type:

```ts
/**
 * A value that can be supplied directly or through an Angular signal.
 *
 * @public
 * @typeParam T - The option value type.
 */
export type ReactiveOption<T> = T | Signal<T>;
```

- [ ] **Step 2: Keep `SignalLike<T>` stable**

Leave existing `SignalLike<T>` exported unless every current consumer can be migrated in the same PR without breakage.

Expected result: existing imports continue to compile.

- [ ] **Step 3: Run a focused type check through Angular tests**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand
```

Expected: It may still pass before behavior changes. Any failure here should be unrelated to the new type and investigated before continuing.

- [ ] **Step 4: Commit**

```sh
git add packages/angular/src/utils/types.ts
git commit -m "feat: add angular reactive option type"
```

## Task 2: Make `chatResource` Update Runtime Options Reactively

**Files:**
- Modify: `packages/angular/src/resources/chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/chat-resource.fn.spec.ts`

- [ ] **Step 1: Write failing tests**

In `packages/angular/src/resources/chat-resource.fn.spec.ts`, mock `fryHashbrown` using the existing pattern from `structured-chat-resource.fn.spec.ts`. Add a top-level test:

```ts
test('chatResource updates runtime options when option signals change', () => {
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/chat-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    chatResource({
      model,
      apiUrl,
      system,
      threadId,
    }),
  );

  model.set('gpt-4.2');
  apiUrl.set('/chat-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/chat-b',
      system: 'System B',
      threadId: 'thread-b',
    }),
  );
});
```

Also assert initial `fryHashbrown` receives the signal values, not signal objects:

```ts
expect(fryHashbrownMock).toHaveBeenCalledWith(
  expect.objectContaining({
    model: 'gpt-4.1',
    apiUrl: '/chat-a',
    system: 'System A',
    threadId: 'thread-a',
  }),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/chat-resource.fn.spec.ts
```

Expected: FAIL because `chatResource` does not currently call `updateOptions()` from an effect.

- [ ] **Step 3: Implement minimal code**

In `chat-resource.fn.ts`:

- Import `effect`.
- Change option types:

```ts
system: ReactiveOption<string>;
model: ReactiveOption<ModelInput>;
apiUrl?: ReactiveOption<string>;
threadId?: ReactiveOption<string | undefined>;
```

- Read initial values:

```ts
apiUrl: options.apiUrl ? readSignalLike(options.apiUrl) : config.baseUrl,
system: readSignalLike(options.system),
model: readSignalLike(options.model),
threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
```

- Add an effect after `hashbrown` is created:

```ts
const optionsEffect = effect(() => {
  hashbrown.updateOptions({
    apiUrl: options.apiUrl ? readSignalLike(options.apiUrl) : config.baseUrl,
    middleware: config.middleware?.map((m): Chat.Middleware => {
      return (requestInit) =>
        runInInjectionContext(injector, () => m(requestInit));
    }),
    system: readSignalLike(options.system),
    model: readSignalLike(options.model),
    tools: options.tools?.map((tool) => bindToolToInjector(tool, injector)),
    emulateStructuredOutput: config.emulateStructuredOutput,
    debugName: options.debugName,
    transport: options.transport ?? config.transport,
    ui: false,
    threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
  });
});
```

- Destroy it:

```ts
destroyRef.onDestroy(() => {
  teardown();
  optionsEffect.destroy();
});
```

- [ ] **Step 4: Run focused test**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/chat-resource.fn.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/angular/src/resources/chat-resource.fn.ts packages/angular/src/resources/chat-resource.fn.spec.ts
git commit -m "feat: update angular chat options reactively"
```

## Task 3: Make `completionResource` Update Runtime Options Reactively

**Files:**
- Modify: `packages/angular/src/resources/completion-resource.fn.ts`
- Create or Modify: `packages/angular/src/resources/completion-resource.fn.spec.ts`

- [ ] **Step 1: Write failing tests**

If no spec exists, create `packages/angular/src/resources/completion-resource.fn.spec.ts`. Mock `fryHashbrown` and add a top-level test equivalent to:

```ts
test('completionResource updates runtime options when option signals change', () => {
  const model = signal('gpt-4.1');
  const apiUrl = signal('/completion-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const input = signal('Summarize this');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    completionResource({
      model,
      apiUrl,
      system,
      input,
      threadId,
    }),
  );

  model.set('gpt-4.2');
  apiUrl.set('/completion-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/completion-b',
      system: 'System B',
      threadId: 'thread-b',
    }),
  );
});
```

Keep arrange/act/assert spacing and top-level `test(...)`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/completion-resource.fn.spec.ts
```

Expected: FAIL because runtime options are only read during initialization.

- [ ] **Step 3: Implement minimal code**

In `completion-resource.fn.ts`:

- Use `ReactiveOption<string>` for `model`, `apiUrl`, `system`, and `threadId`.
- Read initial values into `fryHashbrown`.
- Add an `effect()` that calls `hashbrown.updateOptions(...)` with the latest values.
- Keep the existing input effect that calls `hashbrown.setMessages(...)`.
- Destroy the options effect with `destroyRef.onDestroy`.

- [ ] **Step 4: Run focused test**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/completion-resource.fn.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/angular/src/resources/completion-resource.fn.ts packages/angular/src/resources/completion-resource.fn.spec.ts
git commit -m "feat: update angular completion options reactively"
```

## Task 4: Make `structuredChatResource` Update All Runtime Options Reactively

**Files:**
- Modify: `packages/angular/src/resources/structured-chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/structured-chat-resource.fn.spec.ts`

- [ ] **Step 1: Write failing tests**

Add a top-level test:

```ts
test('structuredChatResource updates runtime options when option signals change', () => {
  const model = signal<ModelInput>('gpt-4.1');
  const apiUrl = signal('/structured-a');
  const system = signal('System A');
  const threadId = signal<string | undefined>('thread-a');
  const hashbrown = createHashbrownStub({ messages: [] });
  fryHashbrownMock.mockReturnValue(hashbrown);

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  TestBed.runInInjectionContext(() =>
    structuredChatResource({
      model,
      apiUrl,
      system,
      threadId,
      schema: s.object('risk summary', {
        risk: s.string('Risk level'),
      }),
    }),
  );

  model.set('gpt-4.2');
  apiUrl.set('/structured-b');
  system.set('System B');
  threadId.set('thread-b');
  TestBed.flushEffects();

  expect(hashbrown.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: 'gpt-4.2',
      apiUrl: '/structured-b',
      system: 'System B',
      threadId: 'thread-b',
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/structured-chat-resource.fn.spec.ts
```

Expected: FAIL because `model` is not read as a signal and `apiUrl` is not updated.

- [ ] **Step 3: Implement minimal code**

In `structured-chat-resource.fn.ts`:

- Update option types to use `ReactiveOption<T>`.
- Read `apiUrl`, `model`, `system`, and `threadId` with `readSignalLike()` for initialization.
- Update the existing `optionsEffect` to read signal values and include `apiUrl`.
- Keep existing `structuredOutput`, `ui`, and `threadId` behavior.

- [ ] **Step 4: Run focused test**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/structured-chat-resource.fn.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/angular/src/resources/structured-chat-resource.fn.ts packages/angular/src/resources/structured-chat-resource.fn.spec.ts
git commit -m "feat: update angular structured chat options reactively"
```

## Task 5: Pass Reactive Options Through Wrapper Resources

**Files:**
- Modify: `packages/angular/src/resources/structured-completion-resource.fn.ts`
- Modify: `packages/angular/src/resources/ui-chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/ui-completion-resource.fn.ts`
- Modify: `packages/angular/src/resources/ui-chat-resource.spec.ts`
- Modify: `packages/angular/src/resources/ui-completion-resource.spec.ts`
- Create or Modify: `packages/angular/src/resources/structured-completion-resource.fn.spec.ts`

- [ ] **Step 1: Write failing wrapper tests**

For `structuredCompletionResource`, mock `structuredChatResource` and assert it receives signal objects for `model`, `apiUrl`, `system`, and `threadId`:

```ts
expect(structuredChatResourceMock).toHaveBeenCalledWith(
  expect.objectContaining({
    model,
    apiUrl,
    system,
    threadId,
  }),
);
```

For `uiChatResource`, continue using the existing mocked `structuredChatResource` and assert:

```ts
expect(structuredChatResourceMock).toHaveBeenCalledWith(
  expect.objectContaining({
    model,
    apiUrl,
    threadId,
  }),
);
```

Do not assert `system` is the original signal for UI resources because UI resources intentionally compile `string | SystemPrompt` through `systemAsString` computed before passing it down. Assert `system: expect.any(Function)` instead.

For `uiCompletionResource`, mock `structuredCompletionResource` and assert the same pass-through pattern.

- [ ] **Step 2: Run wrapper tests to verify failures**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/structured-completion-resource.fn.spec.ts
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/ui-chat-resource.spec.ts
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular --runInBand --testFile=packages/angular/src/resources/ui-completion-resource.spec.ts
```

Expected: FAIL where option types or pass-through behavior are still static.

- [ ] **Step 3: Implement wrapper type updates**

Update wrapper option interfaces:

```ts
model: ReactiveOption<ModelInput>;
apiUrl?: ReactiveOption<string>;
threadId?: ReactiveOption<string | undefined>;
```

For UI resources:

```ts
system: ReactiveOption<string | SystemPrompt>;
```

Keep `systemAsString` as a `computed(...)` and pass that computed to the delegated structured resource. Pass `model`, `apiUrl`, and `threadId` through unchanged.

- [ ] **Step 4: Run wrapper tests**

Run the same three focused commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add packages/angular/src/resources/structured-completion-resource.fn.ts packages/angular/src/resources/structured-completion-resource.fn.spec.ts packages/angular/src/resources/ui-chat-resource.fn.ts packages/angular/src/resources/ui-chat-resource.spec.ts packages/angular/src/resources/ui-completion-resource.fn.ts packages/angular/src/resources/ui-completion-resource.spec.ts
git commit -m "feat: pass angular reactive options through wrappers"
```

## Task 6: API Report and Documentation

**Files:**
- Modify if needed: `packages/angular/angular.api.md` or generated API report artifacts for Angular.
- Modify if needed: `www/analog/src/app/pages/docs/angular/**`

- [ ] **Step 1: Run API report**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx build-api-report angular
```

Expected: If API Extractor reports changed public API output, update the checked-in Angular API report file according to the repo pattern.

- [ ] **Step 2: Check generated report diff**

Run:

```sh
git diff -- packages/angular
```

Expected: public API diff includes `ReactiveOption<T>` and widened resource option fields.

- [ ] **Step 3: Update docs only if needed**

Search docs:

```sh
rg "apiUrl|model|chatResource|structuredChatResource|uiChatResource" www/analog/src/app/pages/docs/angular -n
```

If resource docs include option tables or examples that explicitly say only `string`, update the relevant docs to mention `string | Signal<string>` or `ReactiveOption<T>`.

- [ ] **Step 4: Commit API/docs changes**

If files changed:

```sh
git add packages/angular www/analog/src/app/pages/docs/angular
git commit -m "docs: document angular reactive resource options"
```

If no files changed, record that in the final implementation notes.

## Task 7: Full Verification

**Files:**
- No source edits expected unless verification finds a real issue.

- [ ] **Step 1: Run Angular test suite**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx test angular
```

Expected: PASS.

- [ ] **Step 2: Run Angular lint**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx lint angular
```

Expected: PASS. Prefer fixing lint errors over suppressing them.

- [ ] **Step 3: Run Angular build**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx build angular
```

Expected: PASS.

- [ ] **Step 4: Run API report**

Run:

```sh
NX_DAEMON=false FORCE_COLOR=0 npx nx build-api-report angular
```

Expected: PASS.

- [ ] **Step 5: Run diff check**

Run:

```sh
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Final commit if needed**

If verification required fixes:

```sh
git add <changed-files>
git commit -m "fix: stabilize angular reactive resource options"
```

Expected: branch contains focused commits and all verification output is known before PR.
