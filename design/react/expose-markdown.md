---
Created: 2026-02-08
Author: Mike Ryan
Affects: react
---

# exposeMarkdown (React)

## Objective

Add a React helper `exposeMarkdown(config?)` that exposes `MagicTextRenderer` to the LLM through `exposeComponent(...)`, while making streaming completion state automatic via `s.node(s.streaming.string(...))`.

## Background

`MagicTextRenderer` now supports streaming-aware behavior (`isComplete`, `caret`, parser options), but wiring it to UI chat schemas repeatedly is verbose and easy to get wrong. In particular:

- the LLM should only control markdown content,
- developers should control renderer behavior,
- `isComplete` should be derived from parser node state, not modeled by the LLM.

Hashbrown already uses `s.node(...)` to expose parser state (`complete`, `partialValue`, `value`) for streaming UI props. This makes markdown completion derivation straightforward.

Invariant: the LLM controls only `children`; all other renderer behavior is developer-controlled.

## Goals

- Provide `exposeMarkdown(config?)` in `@hashbrownai/react`.
- Expose exactly one LLM-facing prop: `children`.
- Define `children` schema as `s.node(s.streaming.string(...))`.
- Derive `MagicTextRenderer` props from node state:
  - `children` text from node value/partial value,
  - `isComplete` from node `complete` (strict mapping).
- Allow developers to configure all `MagicTextRenderer` behavior through `config` defaults (for example `options`, `caret`, callbacks, className, nodeRenderers).
- Provide defaults for component `name` and `description`, with overrides.
- Include citation-generation guidance in the default description.

## Non-Goals

- Exposing arbitrary `MagicTextRenderer` props to the LLM.
- Changing core markdown parser semantics.
- Adding Angular support in this change.

## UX / Workflows

Developer usage:

```ts
import { exposeMarkdown } from '@hashbrownai/react';

const components = [
  exposeMarkdown({
    // LLM metadata (optional)
    name: 'Markdown',
    citations: true,

    // developer-controlled renderer props
    className: 'chat-markdown',
    options: { segmenter: { granularity: 'sentence' } },
    caret: true,
  }),
];
```

LLM-emitted node shape (conceptual):

```json
{
  "Markdown": {
    "props": {
      "complete": false,
      "partialValue": {
        "children": "Streaming **mark"
      }
    }
  }
}
```

The wrapper component maps this to:

- `children = "Streaming **mark"`
- `isComplete = false`

When `complete` flips to `true`, wrapper passes `isComplete={true}`.

## Data Model & API Changes

### Schema

Proposed public API:

```ts
export type ExposeMarkdownConfig = Omit<
  MagicTextRendererProps,
  'children' | 'isComplete'
> & {
  /**
   * Component tag name exposed to the LLM.
   * @default "Markdown"
   */
  name?: string;

  /**
   * LLM-facing component description.
   * @default DEFAULT_MARKDOWN_DESCRIPTION
   */
  description?: string;

  /**
   * When true, append citation instructions to the default description.
   *
   * Ignored when `description` is explicitly provided.
   *
   * @default false
   */
  citations?: boolean;
};

export function exposeMarkdown(
  config?: ExposeMarkdownConfig,
): ExposedComponent<ComponentType<{ children: string }>>;
```

Internal exposed schema:

```ts
props: {
  children: s.node(s.streaming.string('Markdown content to render'))
}
```

Internal wrapper mapping (HOF around `MagicTextRenderer`):

```ts
type MarkdownNodeProp = {
  complete: boolean;
  partialValue: string;
  value?: string;
};

function ExposedMarkdownComponent(
  props: {
    children: MarkdownNodeProp;
  } & Omit<MagicTextRendererProps, 'children' | 'isComplete'>,
) {
  const text = props.children.value ?? props.children.partialValue ?? '';
  const isComplete = props.children.complete;

  return <MagicTextRenderer {...props} children={text} isComplete={isComplete} />;
}
```

### Validation

- LLM only sends markdown string content (`children`) through the node wrapper.
- `isComplete` is strictly derived from `children.complete`.
- Renderer callbacks/options are never LLM-driven.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

- `exposeMarkdown` is a thin composition helper:
  1. Build an internal wrapper component around `MagicTextRenderer`.
  2. Bind developer defaults from top-level `config` fields that correspond to `MagicTextRenderer` props.
  3. Expose wrapper with `exposeComponent(...)`.
  4. Use `props.children = s.node(s.streaming.string(...))`.

- Merge precedence:
  - Runtime streamed `children` node always supplies `children` and `isComplete`.
  - Top-level config supplies all other `MagicTextRenderer` props.

- Description precedence:
  - If `description` is provided, use it verbatim.
  - Otherwise, use default base description.
  - If `citations` is `true`, append citation instructions.

Proposed default description text (base):

```text
Render markdown content for the user.

Write all markdown into the `children` prop.
Use standard markdown for headings, lists, links, tables, and code blocks.
```

Citation suffix when `citations` is `true`:

```text
For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.
Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.
```

## Telemetry / Observability

None.

## Backward Compatibility

- Additive API in `@hashbrownai/react`.
- No behavior changes to `MagicTextRenderer` or `exposeComponent`.

## Permissions / Security

- No new permissions.
- Continues to restrict LLM control surface to declared schema props.

## Rollout / Migration

1. Implement `packages/react/src/expose-markdown.fn.ts`.
2. Export from `packages/react/src/public-api.ts`.
3. Update sample usage (for example smart-home) to prefer `exposeMarkdown(...)` over ad-hoc markdown component exposure.
4. Add docs/examples in React package README or site docs.

## Testing

- Unit tests for `exposeMarkdown`:
  - uses default name/description.
  - allows overriding name/description.
  - appends citation guidance when `citations` is `true`.
  - omits citation guidance when `citations` is `false` or omitted.
  - ignores `citations` when `description` is explicitly provided.
  - emits `children` schema as `s.node(s.streaming.string(...))`.
  - forwards top-level renderer config fields to `MagicTextRenderer` wrapper.
  - derives `isComplete` strictly from node `complete`.
  - uses `value` when present, otherwise `partialValue`.
- Integration test with `useUiChat` component registry:
  - streaming markdown renders progressively.
  - caret behavior follows completion transition when enabled in top-level config.
- Ensure tests follow repo style (top-level `test(...)`, arrange/act/assert).

## Open Questions

- None identified.
