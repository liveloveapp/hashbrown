---
title: 'Migration Notes: Hashbrown React Docs'
meta:
  - name: description
    content: 'Notes for migrating Hashbrown transports and persisted schema output across breaking releases.'
---

# Migration Notes

Hashbrown's current transport uses AG-UI over HTTP and SSE. Earlier releases used Hashbrown-specific binary frames. Hashbrown v0.5 also changed how Skillet schemas are printed for models and how parsed values are resolved internally.

The transport and persisted-data migrations are independent. Follow only the sections that apply to your application.

---

## AG-UI Transport

The following server and custom-provider APIs are breaking changes:

| Earlier releases                                                    | Current API                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Completion request owned by Hashbrown                               | `RunAgentInput` from `@ag-ui/core`                       |
| Model selected from the client request                              | Model selected by the server endpoint                    |
| `AsyncIterable<Uint8Array>` of Hashbrown frames                     | `AsyncIterable<AGUIEvent>`                               |
| `encodeFrame`, `decodeFrames`, and `Frame` from `@hashbrownai/core` | Canonical event types and `EventType` from `@ag-ui/core` |
| `application/octet-stream` response                                 | AG-UI SSE encoded with `EventEncoder`                    |
| Common POST `/chat` examples                                        | Default POST `/run` endpoint                             |

Update custom providers to map native SDK streams to canonical AG-UI events. Keep provider credentials and model policy on the server, and encode events only at the HTTP boundary. See [Custom Provider](/docs/react/platform/custom) for the event lifecycle and endpoint shape.

Hashbrown no longer asks provider adapters to load, merge, or save conversations. Applications that persist chats should load the complete message history, hydrate the hook with `messages` or `setMessages(...)`, and save updated messages through their own data layer. `threadId` remains opaque AG-UI identity. See [Persist and Resume Threads](/docs/react/recipes/threads).

There is no compatibility export for the binary frame API. Migrate the server endpoint and client URL together.

---

## Client Model Selection

React hooks no longer accept a `model` option. The client sends an AG-UI run request to the configured transport; the server adapter chooses the provider and model.

Earlier releases:

```tsx
const chat = useChat({
  model: 'gpt-4o-mini',
  system: 'You are a helpful assistant.',
});
```

Current API:

```tsx
const chat = useChat({
  system: 'You are a helpful assistant.',
});
```

Keep the provider-specific `model` setting in your server adapter. To target another endpoint from the client, configure `url` on `HashbrownProvider` or provide a custom `transport` instead of passing a model identifier.

The following core APIs were also removed:

- `ModelInput`, `ModelSpec`, and `ModelResolver`
- `KnownModelIds` and the exported known-model identifier lists

Local browser models are now transports. Replace `model: experimental_local(...)` with `transport: experimental_local(...)`. Arrays that combined local and hosted model identifiers are no longer supported; implement endpoint routing on the server, or choose an explicit client transport for the local experience.

---

## Core Runtime Naming

The direct core API now uses technical lifecycle names:

```ts
// Before
const hashbrown = fryHashbrown(options);
const teardown = hashbrown.sizzle();

// After
const runtime = createChatRuntime(options);
const teardown = runtime.start();
```

The exported `Hashbrown<Output, Tools>` type is now `ChatRuntime<Output, Tools>`. The old factory, type, and lifecycle method were removed without deprecated aliases.

---

## Direct Core HTTP Configuration

The core runtime now stores only transport configuration. `HashbrownProvider` still accepts `url` and `middleware`, but direct `createChatRuntime(...)` calls configure non-default HTTP endpoints through `createHttpTransport`:

```ts
import { createHttpTransport, createChatRuntime } from '@hashbrownai/core';

const runtime = createChatRuntime({
  system: 'You are a helpful assistant.',
  transport: createHttpTransport({
    baseUrl: '/alternate-run',
    middleware: [addAuthorization],
  }),
});
```

Omit `transport` to use AG-UI over POST `/run`.

---

## Structured Output Controls

Structured resources now use their `schema` option as the sole client-side structured output control. Hashbrown sends that schema in `RunAgentInput.hashbrown.responseSchema`; the server adapter owns provider-specific schema enforcement or JSON-mode settings.

Remove the following APIs when upgrading:

- `structuredOutput` from structured chat, structured completion, and generative UI hook options
- `emulateStructuredOutput` from `HashbrownProvider` and `fryHashbrown(...)`
- `StructuredOutputMode`, `StructuredOutputOptions`, `ResponseFormatMode`, and `CompletionCreateParams` from `Chat.Api`

Hashbrown no longer creates or interprets a reserved `output` tool. A developer-defined tool named `output` now behaves like any other tool and participates in tool execution and conversation history.

---

## Who Is Affected

You are likely unaffected if:

- Your app stores chat messages as text and asks the model to generate fresh structured data.
- Your app uses Hashbrown hooks and resources without persisting structured output JSON.
- Your app stores application data after converting it into your own domain model.

You may need a one-time data migration if:

- You persisted raw structured output JSON generated by Hashbrown v0.4.
- You persisted raw generative UI JSON generated by Hashbrown v0.4.
- You replay old v0.4 model output directly into v0.5 Skillet validation or rendering paths.

Hashbrown does not currently ship a public migration helper for this. If this becomes a common need, we may add a supported helper later. For now, keep migration code in your app's data layer and run it only against stored v0.4 data.

---

## `anyOf` Output

Hashbrown v0.4 sometimes wrapped complex `anyOf` branches so models could select a branch explicitly.

Index-wrapped v0.4 output:

```json
{
  "0": {
    "title": "Q3 forecast"
  }
}
```

The v0.5 shape is the branch value itself:

```json
{
  "title": "Q3 forecast"
}
```

When every branch was an object with one string literal discriminator, v0.4 could use the literal value as the wrapper key.

Literal-wrapped v0.4 output:

```json
{
  "success": {
    "data": "Saved"
  }
}
```

The v0.5 shape should include the discriminator field in the object:

```json
{
  "status": "success",
  "data": "Saved"
}
```

---

## Generative UI Output

Hashbrown v0.4 represented component nodes with `$tag`, `$props`, and `$children`.

v0.4 UI output:

```json
{
  "$tag": "app-markdown",
  "$props": {
    "children": "Hello"
  },
  "$children": []
}
```

Hashbrown v0.5 represents component nodes as an object keyed by the exposed component name. Component props resolve through `s.node(...)`, so finalized stored props should be wrapped with parser-node metadata if you are migrating old raw UI JSON.

v0.5 UI output:

```json
{
  "app-markdown": {
    "props": {
      "complete": true,
      "partialValue": {
        "children": "Hello"
      },
      "value": {
        "children": "Hello"
      }
    },
    "children": []
  }
}
```

If your app can regenerate old generative UI output from the original prompt and model, prefer regeneration over hand-migrating stored UI trees.

---

## Root Primitive Output

Hashbrown v0.4 wrapped root primitive and array schemas under `__wrappedPrimitive` when printing JSON Schema for models.

v0.4 root primitive output:

```json
{
  "__wrappedPrimitive": "hello"
}
```

The v0.5 value is the primitive or array itself:

```json
"hello"
```

---

## Recommended Migration Strategy

Treat this as a storage migration, not as normal Skillet runtime behavior.

1. Identify stored records created by Hashbrown v0.4.
2. Migrate those records once at your persistence boundary.
3. Validate the migrated JSON against the v0.5 Skillet schema.
4. Store the migrated v0.5 shape, or store your own domain model instead of raw model output.

Avoid applying migration logic globally in React render paths or every schema validation call. Automatic migration can hide real schema mismatches, especially for ambiguous `anyOf` values.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="/docs/react/concept/schema">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Skillet Schema</h4>
      <p>Review the v0.5 schema language.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/docs/react/recipes/json-parser">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>JSON Parser</h4>
      <p>Use the streaming JSON parser directly.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
