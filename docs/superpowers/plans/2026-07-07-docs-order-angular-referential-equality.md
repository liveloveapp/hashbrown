# Docs Order and Angular Referential Equality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document Hashbrown chat order-of-operations behavior and preserve unchanged Angular structured-output references through `toDeepSignal`.

**Architecture:** Documentation changes live in the existing paired React and Angular message history concept pages. Angular referential equality is implemented once in `toDeepSignal`, which is already the shared value exposure path for Angular structured chat and structured completion. Tests pin the identity behavior at the utility boundary.

**Tech Stack:** Nx, TypeScript, Angular signals, Markdown docs, Vitest.

---

## File Structure

- Modify: `www/analog/src/app/pages/docs/react/concept/message-history.md`
  - Add the React order-of-operations documentation section.
- Modify: `www/analog/src/app/pages/docs/angular/concept/message-history.md`
  - Add the Angular order-of-operations documentation section.
- Modify: `packages/angular/src/utils/deep-signal.spec.ts`
  - Convert this touched spec file to top-level `test(...)`.
  - Add identity-preservation tests before implementation.
- Modify: `packages/angular/src/utils/deep-signal.ts`
  - Add internal reconciliation for values read through `toDeepSignal`.

## Task 1: Document Order of Operations

**Files:**
- Modify: `www/analog/src/app/pages/docs/react/concept/message-history.md`
- Modify: `www/analog/src/app/pages/docs/angular/concept/message-history.md`

- [ ] **Step 1: Add React documentation**

Add a section after "Replace History with `setMessages`" in the React page:

```md
## Order of Operations

Hashbrown creates one chat instance for the hook and keeps its message history until you intentionally replace it. The `messages` option seeds the initial history only; changing the value you passed to `messages` later does not reset an active chat.

Runtime options such as `model`, `system`, `apiUrl`, `threadId`, tools, transport, retries, and debounce settings are applied to future requests. Updating those options does not append a message, clear history, or resend the conversation by itself.

Use `sendMessage` to add a new turn, `setMessages` to replace history, and `reload` to remove the last assistant message before retrying. For completion hooks, `input` is different from chat history: changing `input` synchronizes the backing single user message for the next completion.

Put durable behavior and constraints in `system`. Put conversational facts, prior turns, summaries, and user-visible conversation state in message history.
```

- [ ] **Step 2: Add Angular documentation**

Add a matching section after "Replace History with `setMessages`" in the Angular page:

```md
## Order of Operations

Hashbrown creates one chat instance for the resource and keeps its message history until you intentionally replace it. The `messages` option seeds the initial history only; changing the value you passed to `messages` later does not reset an active chat.

Reactive options such as `model`, `system`, `apiUrl`, `threadId`, tools, and transport are applied to future requests. Updating those options does not append a message, clear history, or resend the conversation by itself.

Use `sendMessage` to add a new turn, `setMessages` to replace history, and `reload` to remove the last assistant message before retrying. For completion resources, `input` is different from chat history: changing `input` synchronizes the backing single user message for the next completion.

Put durable behavior and constraints in `system`. Put conversational facts, prior turns, summaries, and user-visible conversation state in message history.
```

- [ ] **Step 3: Commit docs**

Run:

```bash
git add www/analog/src/app/pages/docs/react/concept/message-history.md www/analog/src/app/pages/docs/angular/concept/message-history.md
git commit -m "docs: clarify chat option order of operations"
```

Expected: commit succeeds.

## Task 2: Add Failing Angular Identity Tests

**Files:**
- Modify: `packages/angular/src/utils/deep-signal.spec.ts`

- [ ] **Step 1: Convert the touched spec file to top-level tests**

Remove the outer `describe('toDeepSignal', () => { ... })` wrapper and convert every `it(...)` call in the file to `test(...)`, preserving existing assertions.

- [ ] **Step 2: Add failing tests**

Add these tests near the existing streaming-data tests:

```ts
test('reuses unchanged nested object references across updates', () => {
  const state = signal({
    user: { name: 'Ada', profile: { title: 'Engineer' } },
    status: 'idle',
  });
  const deepState = toDeepSignal(state);
  const firstUser = deepState.user();
  const firstProfile = deepState.user.profile();

  state.set({
    user: { name: 'Ada', profile: { title: 'Engineer' } },
    status: 'loading',
  });

  expect(deepState.user()).toBe(firstUser);
  expect(deepState.user.profile()).toBe(firstProfile);
  expect(deepState()).toEqual({
    user: { name: 'Ada', profile: { title: 'Engineer' } },
    status: 'loading',
  });
});
```

```ts
test('reuses unchanged nested array references when siblings change', () => {
  const state = signal({
    groups: [
      { id: 'a', items: ['one'] },
      { id: 'b', items: ['two'] },
    ],
  });
  const deepState = toDeepSignal(state);
  const firstGroup = deepState().groups[0];
  const firstItems = deepState().groups[0].items;

  state.set({
    groups: [
      { id: 'a', items: ['one'] },
      { id: 'b', items: ['two', 'three'] },
    ],
  });

  expect(deepState().groups[0]).toBe(firstGroup);
  expect(deepState().groups[0].items).toBe(firstItems);
  expect(deepState().groups[1]).not.toBe(state().groups[1]);
});
```

```ts
test('reuses the root reference when the next value is structurally equal', () => {
  const state = signal({ result: { value: 1 } });
  const deepState = toDeepSignal(state);
  const firstValue = deepState();

  state.set({ result: { value: 1 } });

  expect(deepState()).toBe(firstValue);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npx nx test angular --testFile=packages/angular/src/utils/deep-signal.spec.ts
```

Expected: the new identity tests fail because unchanged references are not yet reused.

- [ ] **Step 4: Commit failing tests**

Run:

```bash
git add packages/angular/src/utils/deep-signal.spec.ts
git commit -m "test: cover angular deep signal identity reuse"
```

Expected: commit succeeds.

## Task 3: Implement Angular Deep-Signal Reconciliation

**Files:**
- Modify: `packages/angular/src/utils/deep-signal.ts`
- Modify if needed: `packages/angular/src/utils/deep-signal.spec.ts`

- [ ] **Step 1: Add a reconciled computed root**

Inside `toDeepSignal`, wrap the incoming signal in a computed signal that remembers the last reconciled value:

```ts
let previous = untracked(signal);
const reconciledSignal = computed(() => {
  const next = signal();
  previous = reconcileValue(previous, next);
  return previous;
});
```

Use `reconciledSignal` as the proxy target so `deepSig()` returns the stabilized root.

- [ ] **Step 2: Add `reconcileValue` helper**

Add an internal helper below `toDeepSignal`:

```ts
function reconcileValue<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) {
    return previous;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) {
      return next.map((value, index) =>
        reconcileValue(previous[index], value),
      ) as T;
    }

    const reconciled = next.map((value, index) =>
      reconcileValue(previous[index], value),
    );

    return reconciled.every((value, index) => value === previous[index])
      ? previous
      : (reconciled as T);
  }

  if (isRecord(previous) && isRecord(next)) {
    const previousKeys = Reflect.ownKeys(previous);
    const nextKeys = Reflect.ownKeys(next);

    if (
      previousKeys.length !== nextKeys.length ||
      nextKeys.some((key) => !previousKeys.includes(key))
    ) {
      return buildReconciledRecord(previous, next) as T;
    }

    const reconciled = buildReconciledRecord(previous, next);

    return nextKeys.every((key) => reconciled[key] === previous[key])
      ? previous
      : (reconciled as T);
  }

  return next;
}
```

Add `buildReconciledRecord(previous, next)` to copy own keys from `next` and recursively reconcile each value. Create the result with `Object.create(Object.getPrototypeOf(next))` so changed custom class instances keep the same prototype shape as `next`. Type the helper around `Record<PropertyKey, unknown>` or local `any` casts for `Reflect.ownKeys` access. Keep the helper internal and avoid mutating either input.

- [ ] **Step 3: Run focused tests and verify pass**

Run:

```bash
npx nx test angular --testFile=packages/angular/src/utils/deep-signal.spec.ts
```

Expected: all `deep-signal` tests pass.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add packages/angular/src/utils/deep-signal.ts packages/angular/src/utils/deep-signal.spec.ts
git commit -m "fix: preserve angular deep signal identity"
```

Expected: commit succeeds.

## Task 4: Verify Affected Packages

**Files:**
- No source edits expected.

- [ ] **Step 1: Run Angular test/build/lint**

Run:

```bash
npx nx test angular
npx nx build angular
npx nx lint angular
```

Expected: all pass.

- [ ] **Step 2: Run docs build/test**

Run:

```bash
npx nx build www
npx nx test www
```

Expected: all pass.

- [ ] **Step 3: Review final diff**

Run:

```bash
git status --short
git log --oneline -5
git diff origin/main...HEAD --stat
```

Expected: working tree is clean, commits are scoped to the spec, docs, tests, and Angular utility implementation.
