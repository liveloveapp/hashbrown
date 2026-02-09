---
Created: 2026-02-08
Author: Mike Ryan
Affects: angular
---

# exposeMarkdown

## Objective

Add an Angular helper `exposeMarkdown(config?)` that exposes markdown rendering to the LLM through `exposeComponent(...)`, while deriving completion from `s.node(s.streaming.string(...))` and supporting a pluggable renderer contract.

## Background

Angular has `exposeComponent(...)` and UI chat rendering via `uiChatResource` + `hb-render-message`. As with React, manually wiring markdown to streaming node state is repetitive and easy to misconfigure.

Angular `MagicText` supports projected template customization directly, but that customization is not ergonomic to pass through `exposeMarkdown(...)`. Angular users often prefer wrapping renderers with their own template structure.

This design introduces a renderer contract:

- Any renderer component with `text` and `isComplete` inputs can be used.
- `exposeMarkdown` continues to own mapping from streamed node state to those inputs.
- Built-in `MagicText` remains the default renderer.

## Goals

- Provide `exposeMarkdown(config?)` in `@hashbrownai/angular`.
- Expose exactly one LLM-facing prop: `children`.
- Define `children` schema as `s.node(s.streaming.string(...))`.
- Internally map node state to renderer inputs:
  - text from `children.value ?? children.partialValue ?? ''`
  - completion from `children.complete`
- Support two renderer modes:
  - built-in `MagicText` mode (supports `options`, `caret`, `className`, callbacks)
  - custom renderer mode (requires only `text` and `isComplete` inputs)
- Enforce that built-in-only options are not allowed when a custom renderer is provided.
- Provide default `name`/`description`, with override and citation guidance option.

## Non-Goals

- Exposing arbitrary renderer props to the LLM.
- Changing markdown parser behavior.
- Automatically forwarding `MagicText` projected templates through `exposeMarkdown`.

## UX / Workflows

Built-in renderer mode:

```ts
import { exposeMarkdown } from '@hashbrownai/angular';

const components = [
  exposeMarkdown({
    name: 'Markdown',
    citations: true,
    className: 'chat-markdown',
    options: { segmenter: { granularity: 'sentence' } },
    caret: true,
  }),
];
```

Custom renderer mode:

```ts
@Component({
  selector: 'hb-my-markdown-renderer',
  standalone: true,
  template: `<my-markdown-view [text]="text()" [complete]="isComplete()" />`,
})
class MyMarkdownRenderer {
  text = input('');
  isComplete = input(false);
}

const components = [
  exposeMarkdown({
    name: 'Markdown',
    renderer: MyMarkdownRenderer,
  }),
];
```

Conceptual LLM node shape:

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

Wrapper mapping:

- `text = "Streaming **mark"`
- `isComplete = false`

## Data Model & API Changes

### Schema

```ts
type MagicTextRendererComponentType = Type<{
  text: unknown;
  isComplete: unknown;
}>;

type ExposeMarkdownBuiltInRendererConfig = {
  renderer?: undefined;
  options?: Partial<MagicTextParserOptions>;
  caret?: boolean;
  className?: string;
  onLinkClick?: (event: MagicTextLinkClickEvent) => void;
  onCitationClick?: (event: MagicTextCitationClickEvent) => void;
};

type ExposeMarkdownCustomRendererConfig = {
  renderer: MagicTextRendererComponentType;
  options?: never;
  caret?: never;
  className?: never;
  onLinkClick?: never;
  onCitationClick?: never;
};

export type ExposeMarkdownConfig = {
  name?: string;
  description?: string;
  citations?: boolean;
} & (ExposeMarkdownBuiltInRendererConfig | ExposeMarkdownCustomRendererConfig);
```

Internal exposed schema:

```ts
input: {
  children: s.node(s.streaming.string('Markdown content to render'))
}
```

### Validation

- LLM can provide only markdown content through `children`.
- Completion mapping is strict and internal (`children.complete` -> `isComplete`).
- When `renderer` is provided:
  - runtime validation checks component metadata includes `text` and `isComplete` inputs,
  - runtime validation rejects `options`, `caret`, `className`, `onLinkClick`, and `onCitationClick`.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

`exposeMarkdown` composition flow:

1. Normalize defaults (`name`, `description`, citation suffix behavior).
2. Always expose one LLM prop schema: `children: s.node(s.streaming.string(...))`.
3. If `renderer` is omitted:
   - use built-in wrapper around `MagicText`,
   - bind built-in config (`options`, `caret`, `className`, callbacks).
4. If `renderer` is provided:
   - validate renderer contract (`text` and `isComplete` inputs),
   - validate disallowed built-in options are absent,
   - use custom wrapper that renders only `renderer` with inputs `{ text, isComplete }`.
5. Provide runtime config through DI token and expose wrapper via `exposeComponent(..., { providers })`.

Description precedence:

- Use explicit `description` verbatim when provided.
- Else use default base description.
- Append citation guidance only when `citations=true`.

## Telemetry / Observability

No built-in telemetry. Integrators may instrument callbacks in built-in mode or in their custom renderer.

## Backward Compatibility

- Additive API in `@hashbrownai/angular`.
- Existing built-in mode behavior remains intact.

## Permissions / Security

- No new permissions.
- LLM control surface remains constrained to declared schema props.

## Rollout / Migration

1. Implement renderer-contract support in `packages/angular/src/utils/expose-markdown.fn.ts`.
2. Add wrapper component(s) for built-in and custom renderer modes.
3. Export new public contract type(s) from `packages/angular/src/public_api.ts`.
4. Add tests for built-in mode, custom mode, and validation errors.

## Testing

- Built-in mode:
  - default name/description.
  - name/description overrides.
  - citation guidance behavior.
  - schema emits only `children: s.node(s.streaming.string(...))`.
  - default `caret=true`.
  - value/partialValue mapping.
  - completion mapping.
  - link/citation callbacks via DI in `hb-render-message` integration.
- Custom mode:
  - renders custom renderer and maps only `text` and `isComplete`.
  - value/partialValue/completion mapping correctness.
  - built-in `MagicText` DOM is not rendered.
  - contract validation errors for missing `text` or `isComplete` inputs.
  - validation error when mixing `renderer` with built-in-only options.
- Test style:
  - top-level `test(...)` only, arrange/act/assert spacing.

## Open Questions

- None.
