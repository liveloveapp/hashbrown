# Angular Reactive Resource Options Design

## Context

Issue #393 asks for Angular resources to accept reactive `apiUrl` and `model` values so an app can switch model or backend configuration without creating one component/resource per provider. The reported use case is a chat UI where the user can switch between providers or models mid-conversation.

The current Angular resource APIs are inconsistent:

- `chatResource()` accepts `model: ModelInput | Signal<ModelInput>`, but reads it only when creating the Hashbrown runtime.
- `completionResource()` accepts a signal-like `model`, but reads it only when creating the runtime.
- `structuredChatResource()`, `structuredCompletionResource()`, `uiChatResource()`, and `uiCompletionResource()` mostly accept plain `ModelInput`.
- `apiUrl` is currently a plain string across resources.
- `system` and `threadId` already accept reactive values in some APIs, but not all resources consistently update the runtime when those values change.

Core already supports this behavior through `hashbrown.updateOptions(...)`, which can update `apiUrl`, `model`, `system`, `threadId`, transport and related runtime options without recreating the Hashbrown instance.

## Goals

- Support Angular `Signal<T>` values for runtime resource options that can reasonably change after initialization.
- Make `model`, `apiUrl`, `system`, and `threadId` consistent across Angular chat and completion resources.
- Keep the public API surface minimal and Angular-native.
- Reuse the existing Hashbrown runtime and `updateOptions(...)` instead of recreating resources.
- Preserve current behavior for plain string/model values.
- Preserve message history when model, API URL, system prompt, or thread ID changes.

## Non-Goals

- Do not expose plain callback functions as public reactive options.
- Do not add global provider-level dynamic configuration for this issue.
- Do not reset messages automatically when runtime options change.
- Do not recreate the underlying `fryHashbrown(...)` instance when options change.
- Do not change React APIs.
- Do not redesign provider selection, fallback logic, or multi-provider orchestration.

## API Design

Add an Angular-specific public helper type:

```ts
export type ReactiveOption<T> = T | Signal<T>;
```

Use `ReactiveOption<T>` in Angular resource options for:

```ts
model: ReactiveOption<ModelInput>;
apiUrl?: ReactiveOption<string>;
threadId?: ReactiveOption<string | undefined>;
```

Use the matching system type for each resource:

```ts
system: ReactiveOption<string>;
```

For UI resources, where the system prompt can be a compiled Hashbrown `SystemPrompt`:

```ts
system: ReactiveOption<string | SystemPrompt>;
```

This keeps reactivity explicitly Angular-native. Internally, `readSignalLike()` may continue to tolerate functions for compatibility with existing implementation details, but public resource option types should not document or expose function callbacks.

## Resource Coverage

Apply the API consistently to:

- `chatResource`
- `completionResource`
- `structuredChatResource`
- `structuredCompletionResource`
- `uiChatResource`
- `uiCompletionResource`

`structuredCompletionResource`, `uiChatResource`, and `uiCompletionResource` should pass reactive options through to their delegated resource instead of eagerly unwrapping values. This keeps the source of truth in the root resource that owns the Hashbrown runtime.

## Runtime Behavior

Each root resource that directly creates a Hashbrown runtime should:

1. Read the current `ReactiveOption<T>` values when calling `fryHashbrown(...)`.
2. Create the Hashbrown runtime once.
3. Register an Angular `effect()` that reads the same reactive options and calls `hashbrown.updateOptions(...)`.
4. Destroy the effect with the resource teardown.

The runtime update should include the options owned by that resource:

- `apiUrl`: read from `options.apiUrl` when provided, otherwise from the injected Hashbrown config.
- `model`: read from `options.model`.
- `system`: read from `options.system`.
- `threadId`: read from `options.threadId` when provided.
- Existing updateable options such as `structuredOutput`, `ui`, `transport`, `middleware`, `emulateStructuredOutput`, `debugName`, `debounce`, `retries`, and `tools` should continue to be passed where the resource already owns them.

When a signal changes:

- Current messages remain unchanged.
- Existing subscriptions remain connected.
- The next send, resend, or internally triggered completion request uses the latest runtime options.

## Implementation Sketch

Define and export the helper type from Angular utilities:

```ts
export type ReactiveOption<T> = T | Signal<T>;
```

Use it in option interfaces:

```ts
export interface ChatResourceOptions<Tools extends Chat.AnyTool> {
  system: ReactiveOption<string>;
  model: ReactiveOption<ModelInput>;
  apiUrl?: ReactiveOption<string>;
  threadId?: ReactiveOption<string | undefined>;
}
```

Update root resource initialization:

```ts
const hashbrown = fryHashbrown({
  apiUrl: options.apiUrl ? readSignalLike(options.apiUrl) : config.baseUrl,
  model: readSignalLike(options.model),
  system: readSignalLike(options.system),
  threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
  // existing options...
});
```

Add an effect:

```ts
const optionsEffect = effect(() => {
  hashbrown.updateOptions({
    apiUrl: options.apiUrl ? readSignalLike(options.apiUrl) : config.baseUrl,
    model: readSignalLike(options.model),
    system: readSignalLike(options.system),
    threadId: options.threadId ? readSignalLike(options.threadId) : undefined,
    // existing updateable options...
  });
});

destroyRef.onDestroy(() => {
  teardown();
  optionsEffect.destroy();
});
```

The exact helper names can follow existing Angular package conventions. If repeating the read/update block across resources becomes noisy, add a small internal helper, but only if it reduces duplication without expanding the public API.

## Developer Documentation

Document that Angular resources accept either a plain value or an Angular signal for runtime options:

```ts
readonly model = signal('gpt-4.1');
readonly apiUrl = computed(() => `/api/${this.provider()}/chat`);

readonly chat = chatResource({
  model: this.model,
  apiUrl: this.apiUrl,
  system: 'You are a helpful assistant.',
});
```

When the signal changes, future requests use the new value while existing messages remain in place.

## Testing

Add focused Angular resource tests with `fryHashbrown` mocked:

- `chatResource` passes initial signal values to `fryHashbrown`.
- Updating `model`, `apiUrl`, `system`, and `threadId` signals calls `hashbrown.updateOptions(...)` with the latest values.
- `completionResource` updates the same runtime options while preserving its existing input-to-message behavior.
- `structuredChatResource` updates runtime options through its existing effect.
- `structuredCompletionResource`, `uiChatResource`, and `uiCompletionResource` pass reactive options through to their delegated resource.
- Plain value options continue to work.

Use top-level `test(...)` only, matching the repository test style.

Verification commands:

```sh
npx nx build angular
npx nx test angular
npx nx lint angular
npx nx build-api-report angular
```

