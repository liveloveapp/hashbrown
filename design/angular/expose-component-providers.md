---
Created: 2026-02-08
Author: Mike Ryan
Affects: angular
---

# exposeComponent Providers

## Objective

Allow Angular `exposeComponent(...)` definitions to include DI providers, and have `hb-render-message` instantiate exposed components with those providers via `NgComponentOutlet` injector support.

## Background

Angular `exposeComponent` currently supports schema/input metadata but cannot carry per-component DI configuration. `hb-render-message` renders nodes with `NgComponentOutlet` inputs/content only and does not provide a custom injector.

This blocks Angular-native configuration patterns for intermediary components (for example `exposeMarkdown`) that need stable, developer-controlled behavior without widening model-controlled props.

## Goals

- Add provider support to Angular `ExposedComponent` and `exposeComponent`.
- Preserve provider metadata through UIKit/tag registry plumbing.
- Update `hb-render-message` to create and pass per-node injectors when providers are defined.
- Keep existing behavior unchanged when no providers are supplied.
- Enable wrapper components (for example markdown exposure wrappers) to configure underlying components through DI.

## Non-Goals

- Generic forwarding of arbitrary Angular outputs from `hb-render-message`.
- Environment-level provider bootstrapping changes.
- Changes to core component schema semantics.

## UX / Workflows

Developer usage:

```ts
import { exposeComponent } from '@hashbrownai/angular';
import { Provider } from '@angular/core';

const providers: Provider[] = [
  { provide: SOME_TOKEN, useValue: { featureFlag: true } },
];

const Card = exposeComponent(MyCardComponent, {
  name: 'Card',
  description: 'Render a card.',
  input: {
    title: s.string('Title'),
  },
  providers,
});
```

Render behavior:

- `hb-render-message` resolves tag registry entry.
- If providers exist, it creates an injector with parent `viewContainerRef.injector`.
- The rendered component receives those providers through Angular DI.

## Data Model & API Changes

### Schema

`ExposedComponent` changes in Angular utils:

```ts
import { Provider } from '@angular/core';

export interface ExposedComponent<T extends { new (...args: any[]): any }> {
  component: T;
  fallback?: Type<{ partialProps?: Signal<Record<string, JsonResolvedValue>> }>;
  name: string;
  description: string;
  children?: 'any' | 'text' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
  providers?: Provider[];
}
```

`exposeComponent` config allows:

```ts
providers?: Provider[];
```

Tag registry entry changes:

```ts
type TagNameRegistry = {
  [tagName: string]: {
    props: Record<string, s.HashbrownType>;
    component: Type<object>;
    fallback?: Type<ComponentFallbackProps>;
    providers?: Provider[];
  };
};
```

### Validation

- Providers are developer-defined only; not model-controlled.
- Existing input schema validation path is unchanged.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

`createUiKit` registry build:

1. Iterate exposed components from core UIKit registry.
2. Copy `providers` onto Angular `tagNameRegistry` entries alongside `props/component/fallback`.

`hb-render-message` rendering:

1. Resolve node entry and tag registry record.
2. Resolve component and inputs as today.
3. Resolve injector:
   - if no providers: return `undefined` (existing behavior).
   - if providers exist: `Injector.create({ providers, parent: viewContainerRef.injector })`.
4. Cache injectors per render node (WeakMap) to avoid recreation churn.
5. Pass injector into `NgComponentOutlet` microsyntax:
   - `injector: getRenderableInjector(node)`.

## Telemetry / Observability

None.

## Backward Compatibility

- Additive API (`providers?` optional).
- No runtime behavior changes for existing components that omit providers.

## Permissions / Security

- No new external permissions.
- Providers execute in app DI context; same trust boundary as app code.
- Since providers are not model-provided, this does not expand model authority.

## Rollout / Migration

1. Add `providers` support in:
   - `packages/angular/src/utils/expose-component.fn.ts`
   - `packages/angular/src/utils/ui-chat.helpers.ts`
   - `packages/angular/src/utils/ui-kit.fn.ts`
2. Update `hb-render-message` injector handling in:
   - `packages/angular/src/components/render-message.component.ts`
3. Add tests for provider propagation and injector usage.
4. Update Angular docs/examples to show provider-backed wrappers.

## Testing

- `exposeComponent` unit tests:
  - accepts providers and preserves them on returned object.
- `createUiKit` tests:
  - retains providers in `tagNameRegistry`.
- `hb-render-message` tests:
  - creates child injector when providers exist.
  - does not create custom injector when providers missing.
  - rendered component can inject provider token values.
  - fallback behavior remains intact with partial props.
- Regression tests:
  - existing UI rendering path unchanged without providers.
- Test style:
  - top-level `test(...)` with arrange/act/assert spacing.

## Open Questions

- Should we support `EnvironmentProviders` in addition to `Provider[]`, or keep v1 to `Provider[]` only?
