---
Created: 2026-01-21
Author: Mike Ryan
Affects: core, react, angular
---

# Generative UI

## Objective

Enable LLMs to return structured, typed UI output that can be validated, streamed, and rendered by Hashbrown in both React and Angular.

## Background

Hashbrown’s UI runtime needs a common representation of “renderable” model output that is schema-validated, stream-friendly, and framework-agnostic. The core package defines the component exposure model and the schema builder for the structured UI tree. Framework packages (React and Angular) provide ergonomic helpers for exposing components, constructing UI schemas for chat/completion, and rendering the resulting component tree into the host framework.

## Goals

- Define a framework-agnostic component exposure model and schema generator in core.
- Allow component hierarchies to be described, validated, and streamed in a component tree format.
- Provide React and Angular integrations that:
  - expose components with typed prop schemas,
  - compile system prompts with component metadata and schema,
  - render the resulting component tree into native framework elements.

## Non-Goals

- No additional framework support beyond React and Angular.
- No new runtime registry or global component lookup mechanisms beyond the per-request set.
- No changes to routing, styling, or component lifecycle semantics.

## UX / Workflows

- Developer workflow (React):
  1) Call `exposeComponent(Component, { name, description, children, props, fallback? })` to register a component.
  2) Pass exposed components to `useUiChat` or `useUiCompletion`.
  3) Receive a UI schema output that is rendered into React elements.

- Developer workflow (Angular):
  1) Call `exposeComponent(Component, { input, name?, description, children, fallback? })` to register a component.
  2) Pass exposed components to `uiChatResource` or `uiCompletionResource`.
  3) Render assistant output via `hb-render-message`, which resolves the tag-name key to a component and instantiates it.

- Model workflow:
  - The model produces a `ui` array of structured nodes as single-key objects.
  - The component tag name is the object key.
  - The value is a streaming node object with optional `props` and `children`.
  - `children` can be streamed arrays of child nodes or streamed text.

## Data Model & API Changes

### Schema

Core defines a uniform `ComponentTree` shape as a single-key object whose key
is the tag name and whose value is a streaming node object:

```ts
type ComponentNode = {
  [tagName: string]: {
    props?: {
      complete: boolean;
      partialValue: JsonResolvedValue;
      value?: Record<string, JsonValue>;
    };
    children?: ComponentNode[] | string;
  };
};

type ComponentTree = ComponentNode[];
```

### Definitions

- `props`: A streaming node wrapper (`s.node(...)`) around the component props schema.
- `props.value`: The fully validated props object. This is **undefined** while props are still streaming.
- `props.partialValue`: The best-effort, partial object parsed so far from the stream.
- `props.complete`: Indicates whether the `props` object has finished streaming. This does **not** imply `props.value` is present.

- The object key is the component tag name.
- The object value is a streaming object with:
  - `props` as a `s.node(...)` wrapper around the props schema to preserve
    access to `partialValue` and `complete` during streaming.
  - `children` as a streaming array (or streaming string for text-only
    components).

`createComponentSchema` produces an `s.anyOf(...)` union of single-key objects,
each of which is a `s.streaming.object` keyed by the component name and
containing `props` and optional `children`.

Example shape:

```ts
s.object('UI', {
  ui: s.streaming.array(
    'List of elements',
    s.anyOf([
      s.streaming.object('Card', {
        Card: s.streaming.object('Card node', {
          props: s.node(s.object('Card props', { title: s.string('title') })),
          children: s.streaming.array('Child elements', /* ... */),
        }),
      }),
    ]),
  ),
});
```

Children constraints:
- `children: 'any'` => `children` is a streaming array of any component schema.
- `children: 'text'` => `children` is a streaming string.
- `children: ExposedComponent[]` => `children` is a streaming array of those schemas.
- `children: false | undefined` => no `children` field.

### Validation

- Prop schemas are enforced per component via `ComponentPropSchema`.
- Angular props can support signal-like inputs by mapping `() => T` to `s.Schema<T>`.

### CRUD / Endpoints

No new endpoints. The UI schema is attached to existing structured chat/completion flows.

## Core Logic / Algorithms

- Flattening components:
  `flattenComponents` traverses the `children` graph to produce a name to component map for rendering lookup.

- Schema construction:
  `createComponentSchema` uses a `WeakMap` to memoize per-component schemas and avoid recursion loops. It returns an `s.anyOf` union of single-key streaming objects.

- React rendering:
  `useUiChat` and `useUiCompletion`:
  - build an `s.object({ ui: s.streaming.array(...) })` schema,
  - compile `SystemPrompt` with component definitions and the schema,
  - transform the structured output into React elements by taking the single object key as the tag name and recursing through `children`.

- Angular rendering:
  `uiChatResource` / `uiCompletionResource`:
  - build the same `ui` schema,
  - compile `SystemPrompt`,
  - attach a tag-name registry to assistant messages,
  - `hb-render-message` uses `NgComponentOutlet` to instantiate components and recursively render children.

- Fallback rendering:
  - The renderer can identify a component as soon as the object key is parsed, even if props or children are not yet available.
  - Fallbacks are used **only** when the `props` node is present but has no `value` yet (i.e., the props object is still streaming).
  - If the tag name is known but `props.value` is not yet available and **no fallback was provided**, nothing should be rendered.
  - Renderer decisions should be based solely on the presence of `props.value` (not `props.complete`).
  - Fallbacks receive the `partialValue` to allow richer placeholders during streaming.

Fallback behavior truth table (summary):
- Tag known + `props` missing: render nothing.
- Tag known + `props` present + `props.value` missing + fallback provided: render fallback.
- Tag known + `props` present + `props.value` missing + no fallback: render nothing.
- Tag known + `props.value` present: render the component.
- Tag unknown: ignore or surface error (framework behavior).

Example fallback config:

```ts
exposeComponent(SomeComponent, {
  name: "SomeComponent",
  props: { ... },
  children: "any",
  fallback: SomeComponentFallback,
});
```

Fallback props:

```ts
type ComponentFallbackProps = {
  tag: string;
  partialProps?: Record<string, JsonResolvedValue>;
};
```

Fallback constraints:
- Angular: `fallback` **must** be an Angular component.
- React: `fallback` can be a React component (including a render function).
- Fallbacks do not receive `children`.

### Canonical streaming example

Example stream lifecycle for a single node:

1) Start node (tag known, props node present but empty):

```ts
{ Card: { props: { complete: false, partialValue: {} } } }
```

2) Partial props streamed:

```ts
{ Card: { props: { complete: false, partialValue: { title: "He" } } } }
```

3) Props complete (value present; `complete` may be true or false depending on stream state):

```ts
{
  Card: {
    props: {
      complete: true,
      partialValue: { title: "Hello" },
      value: { title: "Hello" },
    },
    children: [],
  },
}
```


## Identity & Immutability

- Preserving object identity from the parser is critical for high-performance rendering.
- The renderer and schema resolution must treat parsed nodes as immutable and reuse object identity for unchanged subtrees.
- Implementation guidance (from `design/core/json-parser.md`):
  - Use POJOs + plain functions (no classes).
  - Avoid in-place mutation; prefer immutable updates.
  - Share unchanged subtrees to minimize re-renders.

## Telemetry / Observability

No custom telemetry defined. Errors surface via exceptions:
- system prompt diagnostics at compile time
- unknown component tags at render time (React)
- reflection failures for Angular component selectors

## Backward Compatibility

- Breaking change: component node shape is now a single-key object whose value contains `props` (as a node) and optional `children`.
- Components are scoped to the provided list for each hook/resource; no global registry changes.

## Permissions / Security

- No new permissions model.
- Rendering is limited to explicitly exposed components and their schema-defined props.

## Rollout / Migration

None. Feature already long-standing; no migrations or flags.

## Testing

- React: hook specs verify structured output conversion to rendered elements.
- Angular: resource specs verify wrapping and propagation of UI output.
- Fallback behavior:
  - props streaming with no `value` + fallback provided => fallback rendered with `partialProps`.
  - props streaming with no `value` + no fallback => nothing rendered.
  - props complete => render real component.
  - tag unknown => ignore or error depending on framework.

## Open Questions

- None identified from the current implementation.
