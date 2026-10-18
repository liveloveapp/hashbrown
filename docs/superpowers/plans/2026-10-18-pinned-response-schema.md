# Pinned Response Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a server build and pin the full UI response schema, by exporting the Markdown component's definition from core as `markdownComponent()`, and use it in atc's server and a new docs recipe.

**Architecture:** Core gains a pure `markdownComponent(options?)` that returns a `UiComponentDefinition`; `exposeMarkdown` in Angular and React builds its name, description and props from it, so the browser and a server agree byte for byte. atc's run handler replaces `input.hashbrown.responseSchema` with one built by `createUiJsonSchema` and warns when the browser's differed. A docs recipe explains pinning for any public endpoint.

**Tech Stack:** TypeScript, Hashbrown core / Angular / React, Skillet `s`, Jest (core, react), Vitest (angular, atc), Playwright (atc e2e), Next.js docs (www).

**Spec:** `docs/superpowers/specs/2026-10-18-pinned-response-schema-design.md`

## Global Constraints

- Follow `AGENTS.md`: failing test first; top-level `test(...)` only with arrange/act/assert separated by blank lines; TSDoc on every new export; no new dependencies.
- `markdownComponent` is a public core export (no `ɵ` prefix). `exposeMarkdown` and `ExposeMarkdownConfig` keep their public signatures in both frameworks.
- The schema the model sees must stay byte-identical: the default description and citation text move verbatim from the framework packages.
- atc's server replaces the browser's schema and never rejects a request for it; the warning never includes the schema itself.
- Copy rules for docs and comments: no em-dashes, no history notes, no AI-tell phrasing.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never run bare `git stash` (the pre-commit hook uses the shared stash).
- Docs location (correction to the spec): the `content/docs/*/guide/` pages are not in the docs menu, so the page is a recipe at `recipes/public-endpoint` with a menu entry.

## Review Focus

1. A custom `name`, `description` or `citations: true` passed to `exposeMarkdown` must give the same schema as the same options passed to `markdownComponent` (Tasks 2 and 3 test all three).
2. Angular's custom `renderer` branch of `exposeMarkdown` must use the same name and description as the built-in branch (Task 3 tests it).
3. A run request with `hashbrown.ui: true` but no `responseSchema`, or with no `hashbrown` at all, must reach the model unchanged (Task 4 tests both).
4. A tampered schema must not appear in the server's log line, since it is attacker-controlled and can be large (Task 4 tests the warning text).
5. The real browser's schema must equal the pinned one in both frameworks, or every request warns (Task 5 proves it end to end).

---

### Task 1: Core `markdownComponent`

**Files:**
- Create: `packages/core/src/ui/markdown-component.ts`
- Create: `packages/core/src/ui/markdown-component.spec.ts`
- Modify: `packages/core/src/ui/index.ts` (add the export)
- Modify: `packages/core/src/public_api.ts` (public export next to `createUiJsonSchema`)

**Interfaces:**
- Produces: `markdownComponent(options?: MarkdownComponentOptions): UiComponentDefinition` and `interface MarkdownComponentOptions { name?: string; description?: string; citations?: boolean }`, both exported from `@hashbrownai/core`.

- [ ] **Step 1: Write the failing tests** in `packages/core/src/ui/markdown-component.spec.ts` (Jest globals, like `ui-json-schema.spec.ts`):

```ts
import { s } from '../schema';
import { markdownComponent } from './markdown-component';
import { createUiJsonSchema } from './ui-json-schema';

/** The Markdown definition exactly as Angular and React built it before this change. */
const TODAY = {
  name: 'Markdown',
  description: [
    'Render markdown content for the user.',
    '',
    'Write all markdown into the `children` prop.',
    'Use standard markdown for headings, lists, links, tables, and code blocks.',
  ].join('\n'),
  props: {
    children: s.node(s.streaming.string('Markdown content to render')),
  },
};

const CITATIONS = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

test('markdownComponent gives the model the same schema exposeMarkdown always has', () => {
  const definition = markdownComponent();

  const schema = createUiJsonSchema({ components: [definition] });

  expect(schema).toEqual(createUiJsonSchema({ components: [TODAY] }));
});

test('markdownComponent takes a custom name', () => {
  const definition = markdownComponent({ name: 'Answer' });

  expect(definition.name).toBe('Answer');
});

test('markdownComponent uses a custom description verbatim', () => {
  const definition = markdownComponent({
    description: 'Short answers only.',
    citations: true,
  });

  expect(definition.description).toBe('Short answers only.');
});

test('markdownComponent appends citation guidance to the default description', () => {
  const definition = markdownComponent({ citations: true });

  expect(definition.description).toBe(`${TODAY.description}\n${CITATIONS}`);
});

test('markdownComponent exposes only a streaming children prop', () => {
  const definition = markdownComponent();

  expect(Object.keys(definition.props ?? {})).toEqual(['children']);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx nx test core --testPathPattern=markdown-component`
Expected: FAIL, cannot find module `./markdown-component`.

- [ ] **Step 3: Implement** `packages/core/src/ui/markdown-component.ts`:

```ts
import { s } from '../schema';
import type { UiComponentDefinition } from './ui-json-schema';

const DEFAULT_NAME = 'Markdown';
const DEFAULT_DESCRIPTION = [
  'Render markdown content for the user.',
  '',
  'Write all markdown into the `children` prop.',
  'Use standard markdown for headings, lists, links, tables, and code blocks.',
].join('\n');
const CITATION_GUIDANCE = [
  'For citations, use inline references like `[^source-id]` and include matching definitions like `[^source-id]: Source title` or `[^source-id]: Source title https://example.com`.',
  'Citation numbers are assigned by first inline reference, and if an id is defined multiple times, only the first definition is used.',
].join('\n');

/**
 * Options for {@link markdownComponent}.
 *
 * @public
 */
export interface MarkdownComponentOptions {
  /**
   * The tag name the model uses.
   *
   * @defaultValue "Markdown"
   */
  name?: string;
  /**
   * What the model is told about the component. Replaces the default.
   */
  description?: string;
  /**
   * Appends citation guidance to the default description. Ignored when
   * `description` is set.
   *
   * @defaultValue false
   */
  citations?: boolean;
}

/**
 * The Markdown component's contract with the model: its name, description
 * and streaming `children` prop.
 *
 * `exposeMarkdown` builds from it in the browser. On a server, pass it to
 * `createUiJsonSchema` with your other component definitions to build
 * the same response schema the browser sends, so the server can pin it.
 *
 * @public
 * @param options - The same `name`, `description` and `citations` you pass to `exposeMarkdown`.
 * @returns A component definition for `createUiJsonSchema`.
 */
export function markdownComponent(
  options: MarkdownComponentOptions = {},
): UiComponentDefinition {
  const { name = DEFAULT_NAME, description, citations = false } = options;

  return {
    name,
    description:
      description ??
      (citations
        ? `${DEFAULT_DESCRIPTION}\n${CITATION_GUIDANCE}`
        : DEFAULT_DESCRIPTION),
    props: {
      children: s.node(s.streaming.string('Markdown content to render')),
    },
  };
}
```

Add to `packages/core/src/ui/index.ts`: `export * from './markdown-component';`

Add to `packages/core/src/public_api.ts`, after the `createUiJsonSchema` export block:

```ts
export {
  markdownComponent,
  type MarkdownComponentOptions,
} from './ui/markdown-component';
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx nx test core --testPathPattern=markdown-component`
Expected: 5 passed.

- [ ] **Step 5: Build, lint and update the API report**

Run: `npx nx run-many -t build,lint,test -p core` then `npx nx build-api-report core`
Expected: all pass; the core API report gains `markdownComponent` and `MarkdownComponentOptions`. Commit the report change with the code.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): markdownComponent, the Markdown component's definition for servers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: React `exposeMarkdown` builds from `markdownComponent`

**Files:**
- Modify: `packages/react/src/expose-markdown.fn.tsx`
- Test: `packages/react/src/expose-markdown.fn.spec.tsx`

**Interfaces:**
- Consumes: `markdownComponent`, `createUiJsonSchema` from `@hashbrownai/core`.
- Produces: no new API; `exposeMarkdown(config)` keeps its signature.

- [ ] **Step 1: Write the failing test** (append to `expose-markdown.fn.spec.tsx`; add `createUiJsonSchema, markdownComponent` to its `@hashbrownai/core` import):

```ts
test('exposeMarkdown gives the model the schema markdownComponent defines', () => {
  const cases = [
    {},
    { name: 'Answer' },
    { description: 'Short answers only.' },
    { citations: true },
  ];

  const pairs = cases.map((options) => [
    createUiJsonSchema({ components: [exposeMarkdown(options)] }),
    createUiJsonSchema({ components: [markdownComponent(options)] }),
  ]);

  for (const [exposed, defined] of pairs) {
    expect(exposed).toEqual(defined);
  }
});
```

- [ ] **Step 2: Run it.** Run: `npx nx test react --testPathPattern=expose-markdown`
Expected: PASS. Behaviour does not change, so this test pins parity before the refactor and guards it after. (If it fails to resolve `markdownComponent`, run `npx nx build core` first.)

- [ ] **Step 3: Implement.** In `packages/react/src/expose-markdown.fn.tsx`:
  - delete `DEFAULT_COMPONENT_NAME`, `DEFAULT_DESCRIPTION` and `CITATION_DESCRIPTION_SUFFIX`;
  - import `markdownComponent` from `@hashbrownai/core` (keep `s` only if still used; it should not be);
  - replace the start of `exposeMarkdown`'s body and its return:

```ts
export function exposeMarkdown(
  config: ExposeMarkdownConfig = {},
): ExposedComponent<ComponentType<ExposedMarkdownComponentProps>> {
  const { name, description, citations, ...rendererProps } = config;
  const definition = markdownComponent({ name, description, citations });

  const ExposedMarkdownComponent = ({
    children,
  }: ExposedMarkdownComponentProps) => {
    // Keep the existing body of ExposedMarkdownComponent exactly as it is.
  };

  return exposeComponent(ExposedMarkdownComponent, {
    name: definition.name,
    description: definition.description,
    props: definition.props as unknown as ComponentPropSchema<
      ComponentType<ExposedMarkdownComponentProps>
    >,
  });
}
```

Keep the `@default` notes in `ExposeMarkdownConfig`'s TSDoc as they are.

- [ ] **Step 4: Run the package's checks.** Run: `npx nx run-many -t test,eslint:lint,build -p react` then `npx nx build-api-report react`
Expected: all pass, including every existing `exposeMarkdown` test; the React API report is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "refactor(react): exposeMarkdown builds from core's markdownComponent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Angular `exposeMarkdown` builds from `markdownComponent`

**Files:**
- Modify: `packages/angular/src/utils/expose-markdown.fn.ts`
- Test: `packages/angular/src/utils/expose-markdown.fn.spec.ts`

**Interfaces:**
- Consumes: `markdownComponent`, `createUiJsonSchema` from `@hashbrownai/core`.
- Produces: no new API; `exposeMarkdown(config)` keeps its signature, including the custom `renderer` branch.

- [ ] **Step 1: Write the failing tests** (append to `expose-markdown.fn.spec.ts`, which uses Vitest globals; import `createUiJsonSchema, markdownComponent` from `@hashbrownai/core`; `CustomMarkdownRendererComponent` is already defined at the top of the file):

```ts
test('exposeMarkdown gives the model the schema markdownComponent defines', () => {
  const cases = [
    {},
    { name: 'Answer' },
    { description: 'Short answers only.' },
    { citations: true },
  ];

  const pairs = cases.map((options) => [
    createUiJsonSchema({ components: [exposeMarkdown(options)] }),
    createUiJsonSchema({ components: [markdownComponent(options)] }),
  ]);

  for (const [exposed, defined] of pairs) {
    expect(exposed).toEqual(defined);
  }
});

test('exposeMarkdown with a custom renderer gives the model the same schema', () => {
  const options = { name: 'Answer', citations: true };

  const exposed = createUiJsonSchema({
    components: [
      exposeMarkdown({ ...options, renderer: CustomMarkdownRendererComponent }),
    ],
  });

  expect(exposed).toEqual(
    createUiJsonSchema({ components: [markdownComponent(options)] }),
  );
});
```

- [ ] **Step 2: Run them.** Run: `npx nx test angular -- expose-markdown`
Expected: PASS. Behaviour does not change, so these tests pin parity before the refactor and guard it after. (If `markdownComponent` does not resolve, run `npx nx build core` first.)

- [ ] **Step 3: Implement.** In `packages/angular/src/utils/expose-markdown.fn.ts`:
  - delete `DEFAULT_COMPONENT_NAME`, `DEFAULT_MARKDOWN_DESCRIPTION` and `CITATION_DESCRIPTION_SUFFIX`;
  - import `markdownComponent` from `@hashbrownai/core` (drop `s` from that import if unused);
  - at the top of `exposeMarkdown`, replace the name/description/propsSchema computation with:

```ts
  const definition = markdownComponent({
    name: config.name,
    description: config.description,
    citations: config.citations,
  });
  const propsSchema = definition.props as unknown as ComponentPropSchema<
    typeof ɵExposedMarkdownComponent
  >;
```

  - in both `exposeComponent` calls (custom renderer and built-in), use `name: definition.name` and `description: definition.description`, keep `input: propsSchema` and `providers`. Leave `validateCustomRenderer` and `validateCustomRendererConfig` unchanged.

- [ ] **Step 4: Run the package's checks.** Run: `npx nx run-many -t test,lint,build -p angular` then `npx nx build-api-report angular`
Expected: all pass, including every existing `exposeMarkdown` test; the Angular API report is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/angular
git commit -m "refactor(angular): exposeMarkdown builds from core's markdownComponent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: atc server pins the response schema

**Files:**
- Modify: `examples/atc/server/src/run-handler.ts`
- Test: `examples/atc/server/src/run-handler.test.ts`

**Interfaces:**
- Consumes: `createUiJsonSchema`, `markdownComponent` from `@hashbrownai/core`; `flightCardContract`, `arrivalsBoardContract`, `aircraftCompareContract`, `airportCardContract` from `@atc/shared`.
- Produces: `export const PINNED_RESPONSE_SCHEMA: Record<string, unknown>` and `export function pinResponseSchema(input: RunAgentInput): RunAgentInput` in `run-handler.ts`.

- [ ] **Step 1: Write the failing tests** (append to `run-handler.test.ts`, which imports from `vitest` explicitly; add `onTestFinished, vi` to that import and `PINNED_RESPONSE_SCHEMA, pinResponseSchema` to the `./run-handler` import). The file already has an `input` fixture for a run request; build on it:

```ts
/** A run request whose browser sent `responseSchema`. */
function withSchema(responseSchema: object): RunAgentInput {
  return { ...input, hashbrown: { responseSchema, ui: true } } as RunAgentInput;
}

/** Collects console.warn lines for one test. */
function captureWarnings(): string[] {
  const lines: string[] = [];
  const spy = vi
    .spyOn(console, 'warn')
    .mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
  onTestFinished(() => spy.mockRestore());
  return lines;
}

test('a tampered response schema is replaced with the pinned one and logged without its contents', () => {
  const warnings = captureWarnings();
  const tampered = withSchema({ type: 'object', description: 'SECRET-PAYLOAD' });

  const pinned = pinResponseSchema(tampered) as RunAgentInput & {
    hashbrown: { responseSchema: object; ui: boolean };
  };

  expect(pinned.hashbrown.responseSchema).toBe(PINNED_RESPONSE_SCHEMA);
  expect(pinned.hashbrown.ui).toBe(true);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('response schema');
  expect(warnings[0]).not.toContain('SECRET-PAYLOAD');
});

test('an identical response schema is replaced silently', () => {
  const warnings = captureWarnings();
  const sent = withSchema(JSON.parse(JSON.stringify(PINNED_RESPONSE_SCHEMA)));

  const pinned = pinResponseSchema(sent) as RunAgentInput & {
    hashbrown: { responseSchema: object };
  };

  expect(pinned.hashbrown.responseSchema).toBe(PINNED_RESPONSE_SCHEMA);
  expect(warnings).toEqual([]);
});

test('a request without a response schema is left alone', () => {
  const warnings = captureWarnings();
  const uiOnly = { ...input, hashbrown: { ui: true } } as RunAgentInput;

  const results = [pinResponseSchema(input), pinResponseSchema(uiOnly)];

  expect(results).toEqual([input, uiOnly]);
  expect(warnings).toEqual([]);
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx nx test atc-server`
Expected: FAIL, `pinResponseSchema` is not exported.

- [ ] **Step 3: Implement** in `run-handler.ts`, in the pinning section next to `pinTools` (add `createUiJsonSchema, markdownComponent` to the `@hashbrownai/core` import and the four contracts to the `@atc/shared` import):

```ts
/**
 * The UI the model may render, built from the same definitions, in the same
 * order, as the components both apps expose. Neither app passes UI examples;
 * if one ever does, pass the same ones here.
 */
export const PINNED_RESPONSE_SCHEMA = createUiJsonSchema({
  components: [
    markdownComponent(),
    { ...flightCardContract, children: false },
    { ...arrivalsBoardContract, children: false },
    { ...aircraftCompareContract, children: false },
    { ...airportCardContract, children: false },
  ],
});

const PINNED_RESPONSE_SCHEMA_JSON = JSON.stringify(PINNED_RESPONSE_SCHEMA);

/** A run request as Hashbrown sends it: the UI response schema rides in `hashbrown`. */
type UiRunInput = RunAgentInput & {
  hashbrown?: { responseSchema?: object; ui?: boolean };
};

/**
 * Replaces the response schema the browser sent with the server's own, so
 * the model can only render atc's components. A different schema (tampering,
 * or a browser on an older build) is logged, never rejected and never echoed:
 * it is untrusted and can be large.
 */
export function pinResponseSchema(input: RunAgentInput): RunAgentInput {
  const { hashbrown } = input as UiRunInput;
  if (hashbrown?.responseSchema === undefined) {
    return input;
  }
  if (JSON.stringify(hashbrown.responseSchema) !== PINNED_RESPONSE_SCHEMA_JSON) {
    console.warn(
      '[atc] replaced a response schema that differs from the pinned one',
    );
  }

  return {
    ...input,
    hashbrown: { ...hashbrown, responseSchema: PINNED_RESPONSE_SCHEMA },
  } as UiRunInput;
}
```

Apply it in `createRunHandler` where the input is built:

```ts
        input: pinSystemPrompt(
          pinResponseSchema({ ...input, tools: pinTools(input.tools ?? []) }),
          SYSTEM_PROMPT,
        ),
```

Update `createRunHandler`'s TSDoc: replace "The UI response schema still comes from the client: its Markdown component is defined inside the framework packages, so the server cannot rebuild it." with "The system prompt, the tools, the UI response schema and the output length are fixed here, so the route can only run atc." (merge with the sentence before it so the list appears once).

- [ ] **Step 4: Run the server's checks.** Run: `npx nx run-many -t build,test,lint -p atc-server`
Expected: all pass, including the 3 new tests.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/server
git commit -m "feat(atc): the server pins the UI response schema too

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Prove both browsers send the pinned schema

**Files:**
- Modify: `examples/atc/e2e/src/atc.spec.ts`

**Interfaces:**
- Consumes: `openApp(page, framework)`, `PROMPTS.seattleArrivals`, `arrivals` fixture already in `atc.spec.ts`; the in-process server from Task 4 (it runs in the Playwright worker, so `console.warn` is observable).

- [ ] **Step 1: Write the test** (after "shows Seattle arrivals and highlights them on the map"):

```ts
test('the browser sends the response schema the server pins', async ({
  page,
}, testInfo) => {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    await openApp(page, testInfo.project.name);

    await page.getByRole('button', { name: PROMPTS.seattleArrivals }).click();
    await expect(page.getByTestId('arrivals-row')).toHaveCount(arrivals.length);
  } finally {
    console.warn = warn;
  }

  expect(warnings.filter((line) => line.includes('response schema'))).toEqual(
    [],
  );
});
```

- [ ] **Step 2: Prove the test can fail.** Temporarily change `PINNED_RESPONSE_SCHEMA`'s first component to `markdownComponent({ name: 'Answer' })`, run `npx nx e2e atc-e2e -- -g "response schema"`, and confirm both projects fail with a warning; then revert the change.

- [ ] **Step 3: Run the whole suite.** Run: `npx nx e2e atc-e2e` and `npx nx typecheck atc-e2e`
Expected: 48 passed (the previous 46 plus this test in the angular and react projects), and the typecheck passes.

- [ ] **Step 4: Live gate.** Start the dev servers (`.claude/launch.json` has `atc-server-alt` on 4440, which loads the key from `/Users/blove/repos/hashbrown/.env`, and `atc-angular-alt` on 4441), then run:

`npx tsx --tsconfig examples/atc/e2e/tsconfig.json examples/atc/e2e/prose/eval.ts --runs 4 --url http://127.0.0.1:4441/angular/`

Expected: 24 answers, 0 issues, 0 errors, and no "response schema" warning in the server's output. Stop both servers afterwards.

- [ ] **Step 5: Commit**

```bash
git add examples/atc/e2e/src/atc.spec.ts
git commit -m "test(atc): both apps send exactly the schema the server pins

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Docs recipe "Securing a public endpoint"

**Files:**
- Create: `www/content/docs/react/recipes/public-endpoint.md`
- Create: `www/content/docs/angular/recipes/public-endpoint.md`
- Modify: `www/src/components/menus/docs-menu.data.ts` (Recipes section)
- Modify: `www/test/search/search-index.spec.ts:62` (`toHaveLength(79)` becomes `toHaveLength(81)`)
- Modify: `examples/atc/README.md` (hosting notes link to the page; the "UI response schema still comes from the client" note, if present, is removed)
- Modify: `examples/atc/AGENTS.md` (file map line for `run-handler.ts`, if it lists what is pinned)

- [ ] **Step 1: Update the sitemap count first** (`toHaveLength(81)`) and run `npx nx test www -- search-index`. Expected: FAIL, 79 entries.

- [ ] **Step 2: Add the menu entry** in the Recipes section, after `{ text: 'Remote MCP', path: 'recipes/remote-mcp' }`:

```ts
      { text: 'Public Endpoints', path: 'recipes/public-endpoint' },
```

- [ ] **Step 3: Write the React page.** Frontmatter in the style of the other recipes (`title: 'Securing a Public Endpoint: Hashbrown React Docs'`, a `meta` description of one sentence). Sections, short and concrete, with code quoted from `examples/atc/server/src/run-handler.ts` as it is after Task 4 (copy the real code; do not invent):

  1. **The browser is untrusted.** Everything in a run request (messages, system prompt, tools, the UI response schema) comes from the browser, and anyone can send any request to your endpoint.
  2. **Pin what the model sees, on the server.** The system prompt (`pinSystemPrompt`), the tools (`pinTools`: each replaced with the server's definition, unknown ones dropped) and the UI response schema (`PINNED_RESPONSE_SCHEMA` built with `createUiJsonSchema` from your component definitions plus `markdownComponent()`, applied by `pinResponseSchema`). Share the definitions between browser and server (atc keeps them in a shared package) so the two agree byte for byte.
  3. **Replace, don't reject.** A rejection stops no attacker and breaks real users on an older build after a deploy; log the difference instead (never the payload).
  4. **Bound each request.** Body size, number and length of messages, and output tokens (`limitRequest`).
  5. **Outside the code.** Rate-limit the route (atc: 40 requests a minute per IP on Vercel's firewall) and set a budget cap on the provider key.
  6. A link to atc's `run-handler.ts` on GitHub (`https://github.com/liveloveapp/hashbrown/tree/main/examples/atc`).

- [ ] **Step 4: Write the Angular page** with the same content and the Angular title (`'Securing a Public Endpoint: Hashbrown Angular Docs'`); the server code is the same, and where the page mentions the browser side use `uiChatResource` and `exposeMarkdown` from `@hashbrownai/angular`.

- [ ] **Step 5: Update atc's docs.** In `examples/atc/README.md` hosting notes, add one line: "What the server pins, and why: [Securing a public endpoint](https://hashbrown.dev/docs/angular/recipes/public-endpoint)." Remove any sentence saying the response schema comes from the client. Check `examples/atc/AGENTS.md` for the same and fix it.

- [ ] **Step 6: Run the docs checks.** Run: `npx nx run-many -t build,test,lint -p www` and `npx nx e2e www`
Expected: all pass; the route report includes both new pages.

- [ ] **Step 7: Commit**

```bash
git add www examples/atc/README.md examples/atc/AGENTS.md
git commit -m "docs: securing a public endpoint, with atc's pinned run handler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Final verification

- [ ] Run: `npx nx run-many -t build,test,lint -p core angular react` (React's lint target is `eslint:lint`; include it), `npx nx run-many -t build-api-report -p core angular react`, `npx nx run-many -t build,test,lint,typecheck -p atc-shared atc-server atc-angular atc-react atc-e2e atc`, `npx nx e2e atc-e2e`, `npx nx run-many -t build,test,lint -p www`.
- [ ] Confirm `git diff origin/main --stat` touches only the files named in Tasks 1 to 6 (plus API report files).
- [ ] The PR description includes the changelog line: "core: `markdownComponent()` exports the Markdown component's definition, so a server can build and pin the full UI response schema with `createUiJsonSchema`."
