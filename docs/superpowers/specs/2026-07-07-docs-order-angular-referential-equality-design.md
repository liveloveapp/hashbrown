# Docs Order and Angular Referential Equality Design

## Context

This change covers two GitHub issues in one focused PR:

- Issue #111: document which input and option changes affect chat message history and future requests.
- Issue #148: preserve referential equality for unchanged Angular structured-output values.

The current React and Angular chat APIs create one Hashbrown instance per hook/resource and update runtime options on subsequent reactive changes. Chat history is initialized from `messages` and then changes through explicit message APIs. Completion APIs derive their single user message from `input`.

Core parser tests already cover resolved-value identity preservation for unchanged parser subtrees. React also stabilizes values at the reactivity bridge with deep equality. Angular structured chat and structured completion both expose values through `toDeepSignal`, making that utility the narrowest Angular fix point.

## Goals

- Document the order of operations for message history, option updates, and completion input changes in both React and Angular docs.
- Preserve unchanged nested value references in Angular deep signals when streamed structured data produces an equivalent subtree.
- Keep the public API unchanged.
- Avoid new dependencies.

## Non-Goals

- Do not change core parser behavior.
- Do not add resource-level identity reconciliation in every Angular resource.
- Do not change React behavior.
- Do not document deferred issues #271, #468, or #466 as part of this PR.

## Documentation Design

Add an "Order of Operations" section to the paired message history concept pages:

- `www/analog/src/app/pages/docs/react/concept/message-history.md`
- `www/analog/src/app/pages/docs/angular/concept/message-history.md`

The section will explain:

- `messages` seeds the initial history only.
- `sendMessage`, `setMessages`, and `reload` are the APIs that intentionally mutate chat history.
- Runtime options such as `model`, `system`, `apiUrl`, `threadId`, tools, and transport are applied to future requests without clearing history or sending a message by themselves.
- Completion resources differ from chat resources because their `input` option synchronizes the backing single user message.
- Durable behavior belongs in `system`; conversational state belongs in message history.

This belongs in message history rather than a new concept page because issue #111 is specifically about user expectations around chat history changes.

## Angular Referential Equality Design

Extend `toDeepSignal` in `packages/angular/src/utils/deep-signal.ts` with an internal reconciliation layer.

The reconciler will:

- Keep the previous value inside the deep-signal wrapper.
- Compare each new value against the previous value.
- Reuse the previous reference when the whole subtree is structurally equal.
- Recurse through arrays and values accepted by the existing `isRecord()` predicate so unchanged children keep their identity even when a parent object changes.
- Return primitives by `Object.is`.
- Leave non-record object handling consistent with existing `toDeepSignal` behavior.
- Avoid mutating caller-provided values.

The public `DeepSignal<T>` type and `toDeepSignal<T>()` signature remain unchanged.

## Testing Design

Write failing Angular tests first in `packages/angular/src/utils/deep-signal.spec.ts`:

- Unchanged nested object references are reused across updates.
- Unchanged nested array references are reused while changed siblings receive new references.
- The root reference is reused when the entire next value is structurally equal.

Keep tests top-level with `test(...)` and arrange/act/assert spacing.

Verification after implementation:

- `npx nx test angular`
- `npx nx build angular`
- `npx nx lint angular`
- `npx nx build www`
- `npx nx test www`

## Risks

- Reconciliation adds work on each deep-signal read. The expected values are streamed structured outputs, and the algorithm is scoped to the exposed value path rather than every core parser update.
- If consumers rely on new object references for equivalent Angular structured-output values, this will reduce unnecessary updates. That matches the issue intent and React behavior.
