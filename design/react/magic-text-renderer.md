---
Created: 2026-02-08
Author: Mike Ryan
Affects: react, core
---

# MagicTextRenderer (React)

## Objective

Backfill the design for the shipped React renderer that converts streaming Magic Text parser state into a stable React element tree, with optional caret rendering, citation/link callbacks, and typed node-level renderer overrides.

## Background

Core now provides a streaming Magic Text parser (`createMagicTextParserState`, `parseMagicTextChunk`, `finalizeMagicText`) with immutable AST updates and citation metadata. React needed a first-class renderer that:

- accepts a growing markdown source string,
- incrementally parses only suffix updates when possible,
- renders the parser AST to semantic HTML,
- supports streaming UX (open node state and caret),
- exposes extension points without giving up safe defaults.

This is implemented in:

- `packages/react/src/magic-text-renderer.tsx`
- `packages/react/src/hooks/use-magic-text-parser.tsx`

## Goals

- Render Magic Text AST node types to React DOM with stable keys.
- Support streaming updates from a full source string that grows over time.
- Support parse finalization via `isComplete`.
- Support configurable parser options (`segmenter`, tables, autolinks).
- Provide link/citation click callbacks with node metadata.
- Provide typed node-level renderer overrides and a typed helper for renderer maps.
- Preserve parser-driven segment identity in DOM where possible during incremental updates.

## Non-Goals

- HTML sanitization or URL safety policy enforcement.
- LLM schema exposure concerns (handled by `exposeMarkdown` separately).
- New markdown syntax semantics beyond what core parser emits.
- Telemetry emission from the renderer.

## UX / Workflows

Typical usage:

```tsx
<MagicTextRenderer
  options={{ segmenter: { granularity: 'word' } }}
  caret
  isComplete={streamDone}
  onLinkClick={(event, url, node) => {
    event.preventDefault();
    // custom navigation/analytics
  }}
>
  {markdownText}
</MagicTextRenderer>
```

Workflow behavior:

- `children` is treated as the full current markdown source (`''` fallback).
- `useMagicTextParser` parses suffix-only updates incrementally when `nextText.startsWith(previousText)`.
- non-prefix updates reset parse session and rebuild from the new full string.
- `isComplete={true}` finalizes parse state so open nodes close.
- output root is always `<div data-magic-text-root />`, empty when no root AST node exists.

## Data Model & API Changes

### Schema

Public API exported from `@hashbrownai/react`:

- `MagicTextRenderer`
- `MagicTextRendererProps`
- `MagicTextCaret`, `MagicTextCaretRenderer`, `MagicTextCaretRenderProps`
- `MagicTextCitationRenderData`
- `MagicTextNodeRenderer`, `MagicTextNodeRendererProps`
- `MagicTextNodeRenderers`, `MagicTextNodeRendererKey`
- `createMagicTextNodeRenderers`

`MagicTextRendererProps`:

- `children: string` (full markdown source)
- `options?: Partial<MagicTextParserOptions>`
- `isComplete?: boolean`
- `caret?: boolean | ReactNode | ((props) => ReactNode)`
- `className?: string`
- `onLinkClick?(event, url, node)`
- `onCitationClick?(event, citation, node)`
- `nodeRenderers?: MagicTextNodeRenderers`

Rendered node families include:

- container: `document`, `paragraph`, `heading`, `blockquote`, `list`, `list-item`, `table`, `table-row`, `table-cell`, `em`, `strong`, `strikethrough`, `link`
- leaf/special: `code-block`, `thematic-break`, `text`, `inline-code`, `soft-break`, `hard-break`, `image`, `autolink`, `citation`

### Validation

- Parser options are normalized with defaults in `useMagicTextParser`:
  - `segmenter: true`
  - `enableTables: true`
  - `enableAutolinks: true`
- Citation render data resolves via parser citation state:
  - number from node, then citation numbering map, then id fallback.
  - definition from citation definitions map.
- Citation nodes render as linked refs only when a definition URL exists.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

`useMagicTextParser` session algorithm:

1. Normalize options and compute an options key.
2. Recreate session if options changed.
3. If text unchanged and completion unchanged, reuse previous state.
4. If only completion changed, reparse full text with completion mode.
5. If text changed:
   - prefix update: parse only suffix chunk onto previous parser state.
   - non-prefix update: reset and parse full text.
6. Finalize parser state when `isCompleteInput` is true.

`MagicTextRenderer` rendering algorithm:

1. Build `nodeById` map from parser state nodes.
2. Resolve open node from parser stack.
3. Resolve caret node:
   - hidden for `false`/`undefined`/`null`
   - default caret span for `true`
   - custom node/function output otherwise
4. Attach caret only to the deepest open node when parse is incomplete.
5. Render AST recursively with defaults by node type.
6. Allow per-type renderer override, falling back to `node` renderer override if present.
7. For text nodes, render per-segment spans with:
   - `data-magic-text-segment-kind`
   - `data-magic-text-whitespace`
8. Keep latest click handlers via refs so rerenders do not use stale callbacks.

## Telemetry / Observability

No built-in telemetry. Integrators can instrument `onLinkClick` and `onCitationClick`.

## Backward Compatibility

- Additive public API in `@hashbrownai/react`.
- Does not change core parser API semantics.
- Compatible with streaming and non-streaming usage (`isComplete` optional).

## Permissions / Security

- No new permissions.
- Renderer passes through parsed URLs into `href`/`src`; sanitization and navigation policy remain application concerns.
- No `dangerouslySetInnerHTML`; rendering is structured React elements from parser AST.

## Rollout / Migration

Completed rollout in React package:

1. Added `useMagicTextParser` for prop-driven streaming parse state.
2. Added `MagicTextRenderer` with default AST-to-DOM mapping.
3. Added typed renderer override API and helper (`createMagicTextNodeRenderers`).
4. Exported APIs from `packages/react/src/public-api.ts`.
5. Added focused renderer and hook tests.

## Testing

Current coverage includes:

- `packages/react/src/magic-text-renderer.spec.tsx`
  - block/inline rendering including headings, lists, tables, links, autolinks, images, breaks, code blocks, citations.
  - text segment rendering and segment DOM identity preservation across streaming rerenders.
  - caret visible while open and hidden after completion.
  - per-node and fallback renderer overrides.
  - typed renderer helper usage.
  - latest callback behavior after rerender for links and citations.
  - full node override coverage across all supported node types.
- `packages/react/src/hooks/use-magic-text-parser.spec.tsx`
  - prefix incremental parsing behavior.
  - reset behavior for non-prefix changes.
  - completion/finalization behavior.

## Open Questions

- Should we add an optional URL transform/sanitizer hook to reduce repeated app-level link/image hardening logic?
- Should we expose a lower-level render function for non-DOM targets while reusing the same node override contract?
