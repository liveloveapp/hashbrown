---

## Created: 2026-02-08  
Author: Mike Ryan  
Affects: www

# Hashbrown Docs Authoring Model (Current State)

## Objective

Capture how documentation is currently authored in `www/analog/src/app/pages/docs` so future agents can write new pages that match existing style, structure, and rendering capabilities.

## Scope

This document is based on the current docs corpus under:

- `www/analog/src/app/pages/docs/react/**`
- `www/analog/src/app/pages/docs/angular/**`

Current corpus shape:

- 64 docs pages total
- 32 React pages + 32 Angular pages
- Per framework:
  - `start` (5)
  - `concept` (9)
  - `guide` (3)
  - `recipes` (7)
  - `platform` (8)

The docs are mostly mirrored between React and Angular with framework-specific code/API names.

## Rendering and Authoring Pipeline

### Content source

Docs pages are Markdown files under file-based routes in `www/analog/src/app/pages/docs`.

### Markdown renderer

Docs are rendered via Analog content with Markdown renderer enabled in:

- `www/analog/src/app/app.config.ts`
- `www/analog/vite.config.ts`

`vite.config.ts` enables:

- Shiki syntax highlighting (custom `hashbrown` theme)
- Extra code langs: `sh`, `markdown`
- Custom `marked` extension: canonical symbol references

### Canonical symbol reference extension

A custom extension rewrites tokens like this:

- @hashbrownai/react!useChat:function
- @hashbrownai/angular!chatResource:function

into clickable symbol links (`hb-markdown-symbol-link`).

Implementation lives in:

- `www/analog/src/extensions/CanonicalReferenceExtension.ts`

Pattern currently supported:

- `@?[\w\/-]+![\w]+:[\w]+`

Implications:

- Use this syntax in prose when linking API symbols.
- Keep it exact and fully qualified.
- This is an inline syntax extension, not standard Markdown.

## Required Page Skeleton

Across all docs pages, the stable skeleton is:

1. YAML frontmatter
2. A single H1 heading
3. Main body sections using H2/H3, code blocks, lists, tables, and next-step links

### Frontmatter contract

In the current docs corpus, frontmatter keys are consistently:

- `title`
- `meta` (description entry)

No other frontmatter keys are currently used in docs pages.

Example:

```md
---
title: 'React Quick Start: Hashbrown React Docs'
meta:
  - name: description
    content: 'Take your first steps with Hashbrown.'
---
```

### H1 convention

Each current docs page has exactly one H1.

## Common Structural Patterns by Section Type

### `start/*`

Common shape:

- H1 + subtitle paragraph (`<p class="subtitle">`)
- Early install/setup blocks (`hb-code-example`)
- Introductory concept bullets
- Multiple `---` section dividers
- `hb-next-steps` CTA cards at end (sometimes also mid-page)

### `concept/*`

Common shape:

- Definition paragraph(s)
- Demo embed or short conceptual bullets
- "How it works" explanation
- API options table(s)
- Code samples followed by numbered explanation list
- API reference card links (`hb-next-step`) to `/api/...`

### `platform/*`

Common shape:

- Install package snippet
- Streaming API description
- Backend integration examples across multiple server frameworks
- Uses `hb-backend-code-example` with tabs for `express`, `fastify`, `nestjs`, `hono`
- Transform/middleware section and provider-specific notes

### `recipes/*`

Common shape:

- "Before you start" prerequisites section
- Numbered step headings (`## 1) ...`, `## 2) ...`)
- Heavier code-first teaching
- Explanatory bullets right after each code block
- Closing next-step links

### `guide/*`

Common shape:

- Principle-oriented writing (fewer custom components)
- Do/Don't lists
- Policy/safety framing
- External reading links

## Tone and Style Profile

### Voice

Current docs voice is:

- Practical and implementation-first
- Friendly but direct
- Confident without marketing-heavy language

### Sentence style

Observed writing patterns:

- Short declarative setup lines before code
- Imperative guidance for developer actions
- Frequent "Let's ..." transitions in tutorial sections
- Numbered "breakdown" lists after code to explain intent

### Terminology consistency

Current tooling and content emphasize these preferred terms:

- Tool Calling
- Generative UI
- Exposing Components
- Skillet Schema

## Public Docs Content Rules

### Avoid repository file-path references in docs prose

For public-facing docs pages, do not reference local repository paths (for example `packages/...` or `design/...`) as if end users can navigate them from the website.

Use one of these instead:

- Canonical API symbol links (for example @hashbrownai/angular!exposeMarkdown:function)
- Normal docs-site links under `/docs/...` or `/api/...`
- Plain conceptual references (for example "the Magic Text parser design doc in the Hashbrown repository") when a public URL is not available in-site

### Canonical symbol formatting

Canonical symbol references should be plain inline text, not wrapped in Markdown backticks.

- Wrong: `` `@hashbrownai/angular!exposeMarkdown:function` ``
- Right: @hashbrownai/angular!exposeMarkdown:function

Reason: backticks suppress the docs renderer's canonical-symbol link transformation.

Exception:

- Local repository paths are fine in internal design docs under `design/**`, where the audience is maintainers, not external docs readers.

(Also reflected in review tooling in `www/analog/src/tools/review-docs.ts`.)

### Branding and metaphor use

- Docs occasionally use light food metaphors (for example around "Skillet" and "best bite").
- Metaphors are sparse and not the primary instructional style.

### Practical quality bar

Strong pages generally:

- Start with actionable setup and prerequisites
- Use realistic code snippets over abstract prose
- Explain tradeoffs and safety constraints where relevant
- Link forward to the next implementation step

## Teaching Style Summary

The dominant teaching approach is progressive implementation:

1. Introduce the problem and target outcome.
2. Show minimal working code early.
3. Add complexity one layer at a time.
4. Explain each block with short numbered commentary.
5. End with links to deeper API docs or adjacent concepts.

Recurring pedagogical patterns:

- "Explain, then show code, then decode the code"
- Explicit prerequisite callouts in recipe pages
- Side-by-side conceptual and API-level explanation in concept pages
- Repeated forward navigation using `hb-next-steps`

## Markdown Features in Active Use

The docs currently rely on:

- Headings (`#`, `##`, `###`, `####`)
- Paragraphs and emphasis
- Bulleted and numbered lists
- Fenced code blocks with language tags
- Inline code
- Tables
- Blockquotes
- Horizontal rules (`---`)
- Standard links
- Raw HTML blocks (for custom elements and occasional iframe/video embeds)

## Custom Docs Components and Extensions

Custom elements are registered in:

- `www/analog/src/app/app.component.ts`

### Commonly used in docs content

#### `hb-code-example`

Purpose:

- Framed code block with header and copy action.

Authoring pattern:

```md
<hb-code-example header="terminal">

```sh
npm install ...
```

</hb-code-example>
```

Supported inputs (component API):

- `header` (string)
- `copyable` (boolean, optional)
- `run` (URL string, optional)

Reference:

- `www/analog/src/app/components/CodeExample.ts`

#### `hb-backend-code-example`

Purpose:

- Tabbed backend examples (Express/Fastify/NestJS/Hono by default).

Authoring pattern:

```md
<hb-backend-code-example>

<div backend="express">

```ts
// express example
```

</div>

<div backend="fastify">

```ts
// fastify example
```

</div>

</hb-backend-code-example>
```

Supported inputs:

- `copyable`
- `run`
- `backends`
- `defaultBackend`

Reference:

- `www/analog/src/app/components/BackendCodeExample.ts`

#### `hb-next-steps` and `hb-next-step`

Purpose:

- Visual card list of navigation CTAs to related docs/API pages.

Authoring pattern:

```md
<hb-next-steps>
  <hb-next-step link="concept/functions">
    <div><hb-functions /></div>
    <div>
      <h4>Tool Calling</h4>
      <p>Give the model access to app actions.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
```

`link` behavior:

- Relative links are prefixed to current SDK path (React/Angular).
- Absolute links (`/...`) are used as-is.

References:

- `www/analog/src/app/components/NextSteps.ts`
- `www/analog/src/app/components/NextStep.ts`

#### `hb-expander`

Purpose:

- Collapsible optional detail sections.

Supported input:

- `title` (required)

Reference:

- `www/analog/src/app/components/Expander.ts`

#### Icon elements used inside next-step cards

Common inline icons:

- `hb-code`
- `hb-components`
- `hb-functions`
- `hb-database-cog`
- `hb-message`
- `hb-send`
- `hb-bolt`

These are decorative content elements for visual affordance in CTA cards.

### Available but less common in docs pages

Also registered globally and available to Markdown content:

- `hb-alert`
- `hb-carousel`
- `hb-local-models-demo`
- `hb-magic-text-demo`
- `hb-markdown-symbol-link` (typically inserted automatically by extension)

## Practical Authoring Guidance for Future Agents

When adding a new docs page, follow this baseline template:

1. Add frontmatter with `title` and `meta.description`.
2. Add exactly one H1.
3. For implementation pages, add a subtitle (`<p class="subtitle">...`).
4. Use `hb-code-example` for major code snippets.
5. After important snippets, add a short numbered explanation list.
6. Use canonical symbol references for API mentions in prose.
7. Add `hb-next-steps` linking to related concept/API pages.
8. Keep terminology aligned with existing docs vocabulary.

## Authoring Checklist

- Frontmatter uses only `title` + `meta.description`.
- Exactly one H1.
- Framework-specific API names match page framework.
- Code examples are runnable-looking and scoped to one step.
- Explanations focus on what the code is doing and why.
- Symbol references use `@package!symbol:kind` format where appropriate.
- End of page includes actionable next links.

## Known Inconsistencies in Current Corpus

These exist today and may be worth cleanup over time, but they represent current state:

- Style strictness varies by page age (some older pages are prose-heavy, others are strongly step-by-step).
- Some pages use subtitle blocks while others do not.
- Platform pages are more reference-like; recipe pages are more tutorial-like.

Future docs should prefer the stronger modern pattern: clear prerequisites, stepwise progression, framed code examples, and explicit next steps.
