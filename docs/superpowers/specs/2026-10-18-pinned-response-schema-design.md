# Pinned response schema: `markdownComponent()` and securing a public endpoint

Date: 2026-10-18
Status: approved in conversation, awaiting spec review

## Goal

Let a server own the whole contract a Hashbrown chat sends to the model, so a public
endpoint can only run the app it was built for. Today a server can pin the system
prompt and the tools, but not the UI response schema (the components the model may
render), because the Markdown component's definition exists only inside
`@hashbrownai/angular` and `@hashbrownai/react`.

## Background

- Core already exports `createUiJsonSchema(options)` and `UiComponentDefinition`
  (`packages/core/src/ui/ui-json-schema.ts`, public since #626). They build the same
  JSON Schema `useUiChat` / `uiChatResource` send, from definitions alone, with no
  framework code.
- The browser sends the schema in `input.hashbrown.responseSchema`
  (`packages/core/src/transport/hashbrown-run-agent-input.ts`).
- atc's server (`examples/atc/server/src/run-handler.ts`) already pins the system
  prompt (`pinSystemPrompt`) and the tools (`pinTools`, which replaces the client's
  tools with the server's definitions and drops unknown ones). The response schema
  passes through untouched; its comment says why.
- `exposeMarkdown` in both framework packages repeats the same defaults: the name
  `Markdown`, the default description, the citation suffix, and the `children` prop
  schema `s.node(s.streaming.string('Markdown content to render'))`.

## Decisions

- **Core export:** a public function `markdownComponent(options?)` returning a
  `UiComponentDefinition` (option A, with a short name).
- **Server behaviour:** replace whatever schema the browser sends with the pinned one,
  never reject; log a warning when they differ. A rejection stops no attacker (they
  can send the matching schema) and would break real users during deploy skew.
- **Docs:** a new guide page, "Securing a public endpoint", in both frameworks.
- **One PR** for core, both framework packages, the atc example and the docs.

## Design

### 1. Core: `markdownComponent(options?)`

New file `packages/core/src/ui/markdown-component.ts`, exported from
`packages/core/src/public_api.ts` (public, with TSDoc).

```ts
/** Options for {@link markdownComponent}. @public */
export interface MarkdownComponentOptions {
  /** The tag name the model uses. @defaultValue "Markdown" */
  name?: string;
  /** What the model is told about the component; replaces the default. */
  description?: string;
  /** Appends citation guidance to the default description; ignored with `description`. @defaultValue false */
  citations?: boolean;
}

/**
 * The Markdown component's contract with the model: its name, description and
 * `children` prop. `exposeMarkdown` builds from it in the browser; a server
 * passes it to `createUiJsonSchema` to build the same response schema.
 * @public
 */
export function markdownComponent(options?: MarkdownComponentOptions): UiComponentDefinition;
```

It returns `{ name, description, props: { children: s.node(s.streaming.string('Markdown content to render')) } }`.
The default description and citation suffix move here verbatim from the framework
packages, so the schema the model sees is byte-identical to today's.

Tests (`markdown-component.spec.ts`, written first): defaults; a custom name; a custom
description replaces the default; `citations: true` appends the suffix only when no
description is given; the `children` prop is a streaming string node; and
`createUiJsonSchema({ components: [markdownComponent()] })` equals a snapshot of
today's Markdown schema taken before the change (guards byte-identity).

The API report for core (`npx nx build-api-report core`) gains the new entries.

### 2. Angular and React: `exposeMarkdown` builds from `markdownComponent`

`packages/angular/src/utils/expose-markdown.fn.ts` and
`packages/react/src/expose-markdown.fn.tsx` call
`markdownComponent({ name, description, citations })` and pass its `name`,
`description` and `props` to their own `exposeComponent` (`input` in Angular, `props`
in React). Renderer options (`className`, `caret`, `parserOptions`, `segmenter`, link
and citation handlers, Angular's custom `renderer` and its validation) are unchanged and
stay framework-only. The duplicated constants are deleted. The public signatures of
`exposeMarkdown` and `ExposeMarkdownConfig` do not change.

Tests in each package: the schema a kit built with `exposeMarkdown()` sends equals
`createUiJsonSchema({ components: [markdownComponent()] })`, and the same for a custom
name, description and `citations: true`. Existing `exposeMarkdown` tests keep passing.

### 3. atc server: pin the response schema

In `examples/atc/server/src/run-handler.ts`, beside `pinTools`:

- `PINNED_RESPONSE_SCHEMA`, built once at module load with
  `createUiJsonSchema({ components: [...the four card contracts from @atc/shared, markdownComponent()] })`,
  in the same component order the apps expose them. Neither app passes UI examples to
  `useUiChat` / `uiChatResource`, so none are passed here; if an app adds some, the
  server must pass the same ones.
- `pinResponseSchema(input)`: when the client asked for UI (`input.hashbrown.responseSchema`
  is present), returns the input with the pinned schema in its place. When the client's
  schema differs (compared as JSON), it logs one line with `console.warn`, for example
  `atc: replaced a response schema that differs from the pinned one` (never the schema
  itself, which can be large and attacker-controlled). A request without a response
  schema is returned unchanged.
- The run handler applies it together with `pinSystemPrompt` and `pinTools`.
- The TSDoc and comment on `createRunHandler` stop saying the schema comes from the
  client.

Tests (`run-handler.test.ts`, written first):
- a tampered schema is replaced and warns once;
- an identical schema is replaced silently;
- a request without a response schema is untouched.

Proof that the pinned schema matches what the apps send: an e2e test in both
frameworks (`examples/atc/e2e/src/atc.spec.ts`, which runs the server in-process with
`createApp`) completes a full answer and asserts the server logged no schema mismatch.
That checks the real browser's schema against the pinned one, through each
framework's own schema code.

Gates: `npx nx e2e atc-e2e` (mocked model) and a live `npx nx prose-eval atc-e2e` run
both pass with the pinned schema.

### 4. Docs: "Securing a public endpoint"

A new page in each framework's guide section,
`www/content/docs/react/guide/securing-a-public-endpoint.md` and
`www/content/docs/angular/guide/securing-a-public-endpoint.md`, added to the docs
navigation and search index the way existing guide pages are (including the sitemap
count in `www/test/search/search-index.spec.ts` if it pins one).

Content, short and concrete:
- Everything in a run request comes from the browser and is untrusted.
- Pin on the server: the system prompt, the tools (each replaced with the server's
  definition, unknown ones dropped) and the response schema (`createUiJsonSchema` with
  your component definitions and `markdownComponent()`). Replace, don't reject, and log
  differences.
- Bound each request: body size, message count and length, output tokens.
- Rate-limit the route and set a budget cap on the provider key.
- atc's `run-handler.ts` as the worked example, with code quoted from it.

atc's README hosting notes link to the page.

## Out of scope

- A generic "pin everything" helper in core.
- Changes to how the browser builds, sends or parses its schema.
- Rejecting mismatched schemas.

## Testing summary

- Core, Angular and React: build, test, lint and API reports for each changed package.
- atc: build, test, lint for all atc projects, `nx e2e atc-e2e`, `nx typecheck atc-e2e`,
  and a live prose eval.
- www: build, test, lint, and `nx e2e www` (route report) for the new pages.

## Release

The PR description carries a changelog line for the next release:
"core: `markdownComponent()` exports the Markdown component's definition, so a server
can build and pin the full UI response schema with `createUiJsonSchema`."
