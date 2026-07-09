---
Created: 2026-02-08
Author: Mike Ryan
Affects: angular, core
---

# MagicTextRenderer

## Objective

Evolve Angular’s existing `hb-magic-text` component to render the new streaming core Magic Text AST, matching React feature parity while using Angular-first APIs (signals, projected templates, and `output()` events).

## Background

Core now provides a streaming Magic Text parser (`createMagicTextParserState`, `parseMagicTextChunk`, `finalizeMagicText`) with immutable AST updates, open/closed node state, and citation metadata. React already renders this AST via `MagicTextRenderer`.

Angular currently ships `hb-magic-text`, but it is based on a removed inline parser and fragment model. That implementation must be replaced with AST rendering from core.

This design intentionally allows breaking changes because the old parser contract is obsolete.

## Goals

- Keep and evolve the existing Angular component entrypoint (`hb-magic-text`, class `MagicText`).
- Parse full markdown input that typically grows over time, using suffix-only updates when possible.
- Support `isComplete` finalization behavior consistent with React.
- Render core AST node types to semantic HTML.
- Keep Angular-native extension points through projected templates/directives (not function renderer maps).
- Keep Angular-native interaction events through `output()` for links and citations.
- Preserve parser-driven identity where feasible (stable track keys, minimized DOM churn).

## Non-Goals

- Preserving old fragment-based `prepareMagicText` behavior.
- HTML sanitization policy changes.
- New markdown syntax beyond what core emits.
- Telemetry additions.

## UX / Workflows

Default usage:

```html
<hb-magic-text [text]="markdown()" [isComplete]="done()" />
```

With Angular-native customization:

```html
<hb-magic-text
  [text]="markdown()"
  [isComplete]="done()"
  [caret]="true"
  (linkClick)="onLink($event)"
  (citationClick)="onCitation($event)"
>
  <ng-template hbMagicTextRenderNode nodeType="heading" let-node>
    <h2 class="my-heading">{{ renderChildren(node) }}</h2>
  </ng-template>

  <ng-template hbMagicTextRenderCaret let-node>
    <span class="my-caret" [attr.data-open-node]="node.id">|</span>
  </ng-template>
</hb-magic-text>
```

Behavior:

- `text` is treated as the full current markdown source (`''` fallback).
- If next text starts with previous text, parse only the suffix.
- If next text is not prefix-compatible, reset parser state and parse full input.
- `isComplete=true` finalizes open nodes.
- Caret is shown only while parsing is incomplete and attached to deepest open node.

## Data Model & API Changes

### Schema

Public Angular component surface (evolved):

- `MagicText` component (`selector: 'hb-magic-text'`)
- Inputs:
  - `text: InputSignal<string>` (required)
  - `isComplete?: InputSignal<boolean>` (`false` default)
  - `options?: InputSignal<Partial<MagicTextParserOptions>>`
  - `caret?: InputSignal<boolean | TemplateRef<MagicTextCaretContext>>` (`true` default)
  - `className?: InputSignal<string | undefined>`
- Outputs:
  - `linkClick: OutputEmitterRef<MagicTextLinkClickEvent>`
  - `citationClick: OutputEmitterRef<MagicTextCitationClickEvent>`

Template/directive extension points (Angular-native):

- `MagicTextRenderNode` (`ng-template[hbMagicTextRenderNode]`)
  - input: `nodeType: MagicTextNodeType | 'node'`
  - context: `MagicTextNodeRenderContext`
- `MagicTextRenderTextSegment` (`ng-template[hbMagicTextRenderTextSegment]`)
  - context: `MagicTextTextSegmentRenderContext`
- `MagicTextRenderCaret` (`ng-template[hbMagicTextRenderCaret]`)
  - context: `MagicTextCaretContext`

Proposed public types:

```ts
type MagicTextLinkClickEvent = {
  mouseEvent: MouseEvent;
  url: string;
  node: MagicTextLinkNode | MagicTextAutolinkNode;
};

type MagicTextCitationClickEvent = {
  mouseEvent: MouseEvent;
  citation: {
    id: string;
    number: number | string;
    text?: string;
    url?: string;
  };
  node: MagicTextCitationNode;
};

type MagicTextNodeRenderContext = {
  node: MagicTextAstNode;
  isOpen: boolean;
  isComplete: boolean;
  renderChildren: () => unknown;
};

type MagicTextTextSegmentRenderContext = {
  node: MagicTextTextNode;
  segment: TextSegment;
  index: number;
};

type MagicTextCaretContext = {
  node: MagicTextAstNode;
  depth: number;
};
```

### Validation

- Parser options defaults (same as React):
  - `segmenter: true`
  - `enableTables: true`
  - `enableAutolinks: true`
- Link and citation outputs emit parser-node metadata as-is.
- Citation number resolves from node first, then citation number map fallback.
- Citation URL resolves from definition map when available.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

Signal-driven parser session in component:

1. Normalize options and compute an options key.
2. Recreate parser session when options key changes.
3. On text/isComplete updates:
   - unchanged text + unchanged completion: reuse state.
   - completion-only change: reparse full text and apply completion mode.
   - prefix update: parse suffix chunk only.
   - non-prefix update: reset and parse full text.
4. If `isComplete` is true, call `finalizeMagicText`.

Rendering:

1. Build `nodeById` map from parser state nodes.
2. Resolve current open node stack and deepest open node.
3. Render AST recursively with default semantic mappings:
   - blocks: `div/p/h1-h6/blockquote/ol/ul/li/pre+code/table/tr/th/td/hr`
   - inline: `span/em/strong/s/code/br/a/img/sup`
4. Render text segments with stable `track` keys and:
   - `data-magic-text-segment-kind`
   - `data-magic-text-whitespace`
5. Append caret only on deepest open node when incomplete.
6. For each node:
   - use type-specific projected `hbMagicTextRenderNode` template when present,
   - else use `'node'` fallback template when present,
   - else default renderer.

Interaction:

- `linkClick` emits for both `link` and `autolink`.
- `citationClick` emits for citation anchors/buttons.
- Defaults do not prevent browser navigation; apps can call `preventDefault()`.

## Telemetry / Observability

No built-in telemetry. Consumers may instrument `linkClick` and `citationClick`.

## Backward Compatibility

Breaking by design:

- Replaces fragment-based parser/rendering internals with AST-driven rendering.
- Removes dependency on removed legacy parser contracts.
- Existing selector/class remain (`hb-magic-text`, `MagicText`) for migration simplicity.
- Old directive aliases are removed in the same release; no backward-compat aliases are kept.

## Permissions / Security

- No new permissions.
- URLs are passed through to DOM attributes; sanitization/navigation policy stays application-owned.
- No HTML string injection path (`dangerouslySetInnerHTML` equivalent not used).

## Rollout / Migration

1. Add a prop-driven parser utility in Angular utils (`injectMagicTextParser`) that mirrors `injectJsonParser` signal-session style.
2. Replace internals of `packages/angular/src/components/magic-text-renderer.component.ts` with AST-based renderer that consumes `injectMagicTextParser`.
3. Add template directives for node/caret/text-segment customization.
4. Update `packages/angular/src/public_api.ts` exports for new/changed types.
5. Update Angular docs/samples to the new API.
6. Remove legacy fragment types/exports no longer used.

## Testing

- Component rendering parity with React cases:
  - headings, lists, blockquotes, code blocks, tables, links, autolinks, images, breaks, citations.
- Streaming behavior:
  - prefix suffix-only parse updates.
  - non-prefix resets.
  - completion finalizes open nodes.
- Caret behavior:
  - visible while open, hidden after completion.
  - custom caret template rendering.
- Custom templates:
  - node-type override path.
  - fallback `'node'` override path.
  - text-segment template override.
- Events:
  - `linkClick` emits latest node/url.
  - `citationClick` emits citation metadata from citation state.
- DOM stability:
  - unchanged segment DOM nodes preserved where identity is stable.
- Testing style:
  - top-level `test(...)` only, with arrange/act/assert blank lines.

## Open Questions

- None.

Resolved decisions:

- Remove backward-compat aliases for old directive names in the same release.
- Keep URL policy fully app-level in v1 (no optional URL transform hook).
