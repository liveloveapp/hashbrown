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

## Non-Goals

- Defining a new JSON parser or streaming protocol (see `design/ideas/2026-01-25-streaming-json-parser-react-hook-angular-signal.md`).
- Designing a serialization API for converting UI trees to JSON (explicitly dropped for now).
- Changing the shape of existing assistant message payloads beyond optional support for `ui` inputs in Angular rendering.

## UX / Workflows

- React usage:
  - `useUiKit({ components: [...] })` produces a UIKit instance.
  - UIKit instances can be composed and/or mixed with `exposeComponent(...)`.
  - `useUiChat({ components: [uiKit, exposeComponent(...)] })` and `useUiCompletion({ components: [uiKit] })` merge component registries.
  - `uiKit.render(value)` returns React nodes ready to render, where `value` is the resolved UI JSON value (not a string).
- Angular usage:
  - `uiKit = createUiKit({ components: [...] })` created in a component class.
  - `uiKit.render(value)` returns the same `ui` array shape used by message rendering (see Data Model & API Changes).
  - `hb-render-message` accepts `ui` input directly in addition to `message`, but not both at once.

## Data Model & API Changes

### Schema

- Core: Introduce a UIKit factory that computes a normalized component registry and resolved Skillet schema from inputs.
  - Inputs are a mixed array of `exposeComponent(...)` definitions and UIKit instances.
  - Composition is resolved into a single registry and schema.
- React: `useUiKit(...)` memoizes the computed schema using a stable serialized form of the schema and updates only when that serialized schema changes.
- Angular: `createUiKit(...)` produces a UIKit with identical schema resolution and composition rules.
- Schema serialization for memoization lives in core, with React/Angular building on it as needed.

### UI JSON shape

- `ui` uses the same array shape as existing assistant message content (`ComponentNode[]`).
- Each array entry is an object keyed by the component tag name, with a `props` envelope and optional `children`.

```ts
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
- **Schema change detection**
  - Compute a stable serialized form of the resolved schema (canonical JSON).
  - In React, memoize the UIKit instance based on this serialized form to avoid unnecessary re-renders.
- **Rendering**
  - `render(value)` accepts resolved JSON values only (no strings or streaming chunks).
  - `render(value)` does not accept `null` or `undefined` (enforced in the type signature).
  - Rendering preserves object identity for nodes and avoids mutation of inputs.

## Telemetry / Observability

- None planned.

## Backward Compatibility

- Existing `useUiChat` / `useUiCompletion` call sites remain valid and unchanged.
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
  - `render(value)` outputs the same `ui` array shape used by message rendering.
  - `hb-render-message` accepts `ui` input directly in addition to `message`, but throws if both are provided.

## Open Questions

- What non-goals should be explicitly declared beyond serialization and parser work?
