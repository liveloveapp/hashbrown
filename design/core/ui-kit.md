---
Created: 2026-01-25
Author: Mike Ryan
Affects: core, react, angular
---

# UIKit Composition for Generative UI

## Objective

Provide a way for developers to use Hashbrown's generative UI without requiring Hashbrown's direct-to-LLM approach, by composing UIKit instances that can render resolved UI JSON values into framework components.

## Background

The existing generative UI flow couples component exposure to direct LLM calls. The UIKit idea introduces a composable layer that owns schema resolution and rendering from already-resolved UI values. This enables developers to reuse Hashbrown's rendering pipeline while managing LLM calls, storage, or transport themselves. The related idea doc is `design/ideas/2026-01-25-uikit-instance-serialization-hydration.md`.

## Goals

- Allow developers to render UIs from resolved JSON values using Hashbrown components.
- Enable composition of component registries via UIKit instances and `exposeComponent(...)` entries.
- Keep existing `useUiChat` / `useUiCompletion` APIs working unchanged.
- Improve LLM integration by returning a full, ready-to-use schema and supporting prompt-based UI examples.

## Non-Goals

- Defining a new JSON parser or streaming protocol (see `design/ideas/2026-01-25-streaming-json-parser-react-hook-angular-signal.md`).
- Designing a serialization API for converting UI trees to JSON (explicitly dropped for now).
- Changing the shape of existing assistant message payloads beyond optional support for `ui` inputs in Angular rendering.

## UX / Workflows

- React usage:
  - `useUiKit({ components: [...] })` produces a UIKit instance.
  - `useUiKit({ components: [...], examples: prompt\`...\` })` produces a UIKit instance with compiled UI examples.
  - UIKit instances can be composed and/or mixed with `exposeComponent(...)`.
  - `useUiChat({ components: [uiKit, exposeComponent(...)] })` and `useUiCompletion({ components: [uiKit] })` merge component registries.
  - `uiKit.schema` is the full schema object ready to pass to the LLM (not just the nodes array).
  - `uiKit.examples` stores the compiled UI examples for LLM usage.
  - `uiKit.render(value)` returns React nodes ready to render, where `value` is the resolved UI JSON wrapper object (not a string).
  - Wrapper example:
    - `{ ui: [{ Button: { props: { value: { label: "Save" } } } }] }`
- Angular usage:
  - `uiKit = createUiKit({ components: [...] })` created in a component class.
  - `uiKit = createUiKit({ components: [...], examples: prompt\`...\` })` supports prompt-based examples.
  - `uiKit.render(value)` accepts the resolved UI JSON wrapper object and returns the same `ui` array shape used by message rendering (see Data Model & API Changes).
  - `hb-render-message` accepts either `message` or the full resolved UI wrapper object, but not both at once.

## Data Model & API Changes

### Schema

- Core: Introduce a UIKit factory that computes a normalized component registry and resolved Skillet schema from inputs.
  - Inputs are a mixed array of `exposeComponent(...)` definitions and UIKit instances.
  - Composition is resolved into a single registry and schema.
- Core: Return a full schema object (not just the UI nodes array schema).
  - The wrapper schema includes a `ui` field with a streaming array of UI nodes.
  - The wrapper schema description embeds compiled UI examples so the LLM sees them.
- React: `useUiKit(...)` memoizes the computed schema using a stable serialized form of the schema and updates only when that serialized schema changes.
- Angular: `createUiKit(...)` produces a UIKit with identical schema resolution and composition rules.
- Schema serialization for memoization lives in core, with React/Angular building on it as needed.
  - Example prompt compilation occurs in core against the fully resolved component registry.
  - React/Angular pass the `prompt` template result through unchanged.

### Examples for the LLM

- UIKit accepts `examples` as a `prompt\`...\`` template literal.
- Core compiles the prompt against the fully resolved UIKit component registry (including composed kits).
- Compiled examples are injected into the wrapper schema description so they are visible to the LLM.

### UI JSON shape

- The top-level wrapper object includes `ui` and uses the same array shape as existing assistant message content (`ComponentNode[]`).
- Each array entry is an object keyed by the component tag name, with a `props` envelope and optional `children`.

```ts
type UiWrapper = {
  ui: UiArray;
};

type UiNode = {
  [tagName: string]: {
    props?: {
      complete: boolean;
      partialValue: JsonResolvedValue;
      value?: Record<string, JsonValue>;
    };
    children?: UiNode[] | string;
  };
};

type UiArray = UiNode[];
```

### Validation

- UIKit construction performs a collision check on component `name`.
  - If the same name maps to different component implementations, throw synchronously at construction.
  - If the same name maps to the same implementation (reference identity), allow it.
- Validate that input objects are either UIKit instances or `exposeComponent(...)` entries.

### CRUD / Endpoints

- None.

## Core Logic / Algorithms

- **Composition algorithm**
  - Flatten inputs into a list of `exposeComponent(...)` entries.
  - Build a normalized registry keyed by component name.
  - Detect name collisions and throw at construction if mismatched.
  - Resolve schema from the normalized registry.
- **Wrapper schema construction**
  - Build a top-level schema with a single `ui` field (streaming array of nodes).
  - If examples are provided, compile them and append to the wrapper schema description.
- **Schema change detection**
  - Compute a stable serialized form of the resolved schema (canonical JSON).
  - In React, memoize the UIKit instance based on this serialized form to avoid unnecessary re-renders.
- **Rendering**
  - `render(value)` accepts the resolved wrapper object only (no strings or streaming chunks).
  - `render(value)` does not accept `null` or `undefined` (enforced in the type signature).
  - Rendering preserves object identity for nodes and avoids mutation of inputs.

## Telemetry / Observability

- None planned.

## Backward Compatibility

- UIKit APIs are currently unreleased, so breaking changes within this design are acceptable.
- Arrays of `exposeComponent(...)` continue to work as before.
- UIKit instances are additive and compositional.

## Permissions / Security

- No new permissions.

## Rollout / Migration

- Introduce UIKit APIs as additive features.
- No migration required for existing usage.

## Testing

- Core:
  - Compose registries from mixed UIKit and `exposeComponent(...)` inputs.
  - Collision detection throws on mismatched component names.
  - Schema resolution stable across identical inputs.
- React:
  - `useUiKit` memoizes based on serialized schema changes only.
  - `useUiChat` / `useUiCompletion` accept UIKit entries and merge registries.
  - `render(value)` returns renderable React nodes from resolved values.
- Angular:
  - `createUiKit` composes registries and enforces collision checks.
  - `render(value)` accepts the wrapper object and outputs the same `ui` array shape used by message rendering.
  - `hb-render-message` accepts the wrapper object directly in addition to `message`, but throws if both are provided.

## Open Questions

- None. The following are explicitly decided:
  - `uiKit.schema` is the wrapper schema only (no node-only schema returned).
  - `render(...)` and `hb-render-message` accept the wrapper object only.
  - Example prompts are concatenated with newlines and injected into the wrapper description.
  - `createUiKit` throws if example prompt compilation reports diagnostics.
  - System prompts may still include `<ui>...</ui>` blocks; examples are additive.
