# Proposed Plan: Hashbrown Angular MagicTextRenderer (Override-friendly)

## Goal

Add a first-class MagicTextRenderer to `packages/angular` so consumers can render streaming/optimistic magic text with minimal markup, while allowing per-node override templates. Leverages enriched fragment data from `@hashbrownai/core` (`tags`, `renderWhitespace`, `isStatic`, link metadata).

## Deliverables

- Standalone Angular component in `packages/angular` (e.g., `HbMagicTextRenderer`).
- Structural directives for overrides with default renderers when overrides are absent.
- Public API exports for the component, directives, and contexts/types.
- Styling contract: semantic classes/data-attrs + timing vars only (no colors/backgrounds baked in).
- Jest/Angular TestBed snapshot & interaction tests inside `packages/angular`.
- README/typedoc usage notes.

## Component & Directive API (proposed)

- Inputs:
  - `text: string` (required) — streaming/optimistic content.
  - `defaultLinkTarget?: string` (default `_blank`).
  - `defaultLinkRel?: string` (default `noopener noreferrer`).
  - `citations?: Array<{ id: string; url: string }>` — optional citation map (ids are strings, consistent with core output).
- Dependencies: `prepareMagicText` from `@hashbrownai/core` (uses `tags`, `renderWhitespace`, `isStatic`, link metadata).
- Override directives (contexts expose `node`/`fragment`):
  - `*hbMagicTextLink` — link-wrapped text fragments (link attrs + fragment).
  - `*hbMagicTextText` — non-link text fragments (tags, state, isStatic, text).
  - `*hbMagicTextCitation` — citation fragments (citation data + resolved/unresolved info).
  - `*hbMagicTextWhitespace` — optional override for before/after spaces (position + fragment).
- Default templates are provided for every slot when no override is supplied.

Override context details (available in `let-node`/`let-fragment`):

- Link: `text`, `tags`, `state`, `isStatic`, `renderWhitespace`, `marks.link` (href/title/ariaLabel/rel/target), full fragment.
- Text: `text`, `tags` (`strong`|`em`|`code`), `state`, `isStatic`, `renderWhitespace`, full fragment.
- Citation: `citation` (`id`, `number`, optional `url` if resolved), `text` (`[n]`), `state`, `isStatic`, `renderWhitespace`, full fragment.
- Whitespace: `position` (`before`|`after`), associated fragment, and whether `renderWhitespace` is true for that side.

## Rendering strategy

- Single `@for` over `fragments` (sorted/keyed).
- Whitespace: use `fragment.renderWhitespace.before/after`; apply `*hbMagicTextWhitespace` if present, otherwise default spans.
- Text: default renderer wraps based on `fragment.tags` (strong/em/code) without recursion; `*hbMagicTextText` can replace it.
- Links: if `marks.link` and `*hbMagicTextLink` provided, use it; otherwise default anchor with rel/target defaults and `(linkClick)` output; default prevents navigation unless `event.defaultPrevented` or `data-allow-navigation`.
- Citations: resolve via a `Map` from `citations`; `*hbMagicTextCitation` can override; default renders it like [1], [2], etc, incrementing for each discovered citation.
  - Default citation rendering: render `[n]` text; use an anchor with rel/target defaults only when a matching citation URL is provided; otherwise render a placeholder span with SR-only text.
- Static/provisional: bind classes from `fragment.state`/`fragment.isStatic`; zero duration for static.

## Styling contract (initial)

- CSS vars (CSS only; no TS theme tokens, no baked colors/backgrounds):
  - `--hb-fragment-duration`: suggested timing hook per fragment.
  - `--hb-fragment-delay`: suggested delay hook per fragment.
  - `--hb-fragment-index` (optional): emitted when needed to help stagger.
  - All visual styling (colors/bg/borders) is left to consumers.
- Classes/data attributes (semantic only):
  - `.hb-fragment`, `.hb-fragment--provisional`, `.hb-fragment--static`, `.hb-space`, `.hb-space--before/after`, `.hb-text`, `.hb-text--code`, `.hb-link`, `.hb-citation`, `.hb-citation-placeholder`.
  - Data attrs like `data-fragment-kind="text|citation"`, `data-fragment-state="final|provisional"` for animation/selection.

## Tests (packages/angular)

- Snapshot tests via Angular TestBed (JSDOM) covering mixed content, provisional/whitespace behavior, nested emphasis+code, adjacent links spacing, line breaks/incomplete link, and verifying override directives are honored.
- Interaction test: clicking a rendered link emits `(linkClick)` and prevents navigation by default; `(citationClick)` behaves the same way.

## Outputs

- `(linkClick)` payload: `{ event: MouseEvent; href: string; fragment?: MagicTextFragment }`; default prevents navigation unless `event.defaultPrevented` or the link has `data-allow-navigation`.
- `(citationClick)` payload: `{ event: MouseEvent; citation: { id: string; url?: string }; fragment: MagicTextFragment }`; same navigation prevention defaults.

## Migration notes

- Finance sample can switch to the new component and drop bespoke renderer logic once stable.
