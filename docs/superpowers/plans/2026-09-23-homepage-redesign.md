# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild hashbrown.dev's homepage around installing Hashbrown, with a headless-to-headful threadplane banner. Remove workshops, Bluesky, LiveLoveApp CTAs, lead generation, and the announcement toast.

**Architecture:** The homepage becomes nine small standalone Angular components in `www/analog/src/app/components/home/`. Their copy and code samples live in one pure data module, `home.content.ts`. Copy/track behavior lives in pure functions with unit tests. The framework preference comes from the existing `ConfigService.sdk` signal, so one toggle drives every section. Removals are separate commits so each can be reviewed and reverted on its own.

**Tech Stack:** Analog (Angular 22, standalone components, signals), `@analogjs/content`, Vitest (`@analogjs/vitest-angular`), Fathom (already loaded in `index.html`), and Google Fonts. No new dependencies. `firebase` is removed.

**Spec:** `docs/superpowers/specs/2026-09-23-homepage-redesign-design.md`.

**Visual reference:** `.superpowers/brainstorm/59559-1790186454/content/spec-visual.html`, served by the brainstorm server. Open it in the browser pane to compare while building.

---

## Conventions for every task

- The working directory is the repo root: `/Users/blove/repos/hashbrown/.claude/worktrees/upbeat-merkle-3df7c0`.
- Tests use top-level `test(...)` only. No `describe`, `it`, `beforeEach` or `afterEach`. Put a blank line between arrange, act and assert.
- New reusable functions get a TSDoc `/** ... */` block.
- Components are standalone and use `input()` / `signal` / `computed`. Home components use `changeDetection: ChangeDetectionStrategy.OnPush`, like `Samples.ts` and `Media.ts`.
- Headings use `font-family: var(--font-heading)`, defined in Task 1. Body text uses `Fredoka` and code uses `JetBrains Mono`.
- The pre-commit hook runs lint and Prettier. If it reformats files, that's expected.
- Run a single test file with: `npx vitest run --config www/analog/vite.config.ts <path>`. If that fails to resolve, fall back to `npx nx test www` and read the output for the file.

## File map

**Create:**

| File | Responsibility |
|---|---|
| `www/analog/src/app/services/AnalyticsService.ts` | `trackEvent()` pure function + injectable wrapper |
| `www/analog/src/app/services/AnalyticsService.spec.ts` | Tests for `AnalyticsService.ts` |
| `www/analog/src/app/components/home/home.content.ts` | All homepage copy, commands, prompts, code samples, capability data, URLs |
| `www/analog/src/app/components/home/home.content.spec.ts` | Tests for `home.content.ts` |
| `www/analog/src/app/components/home/copy-text.ts` | `copyText()` pure helper (clipboard + track) |
| `www/analog/src/app/components/home/copy-text.spec.ts` | Tests for `copy-text.ts` |
| `www/analog/src/app/components/home/latest-posts.ts` | `selectLatestPosts()` pure function |
| `www/analog/src/app/components/home/latest-posts.spec.ts` | Tests for `latest-posts.ts` |
| `www/analog/src/app/components/home/InstallCommand.ts` | Framework tabs, command, copy button |
| `www/analog/src/app/components/home/HomeHero.ts` | Hero section |
| `www/analog/src/app/components/home/WorksWith.ts` | Provider row |
| `www/analog/src/app/components/home/HowItWorks.ts` | The three "How it works" steps |
| `www/analog/src/app/components/home/Capabilities.ts` | The six capability groups |
| `www/analog/src/app/components/home/RealApp.ts` | Invoicing showcase |
| `www/analog/src/app/components/home/ThreadplaneBanner.ts` | threadplane banner |
| `www/analog/src/app/components/home/LatestPosts.ts` | Newest blog posts |
| `www/analog/src/app/components/home/ClosingCta.ts` | Closing install CTA |
| `www/analog/public/image/landing-page/threadplane/brian-skeptical.webp` | Banner photo |
| `www/analog/public/image/landing-page/invoicing.jpg` | Invoicing screenshot |

**Modify:**

| File | Change |
|---|---|
| `www/analog/index.html` | Load the Inter Tight font |
| `www/analog/src/styles.css` | Add `--font-heading` |
| `www/analog/src/app/pages/(home).page.ts` | Assemble the new sections |
| `www/analog/src/app/components/Header.ts` | Quick start button, heading font, remove workshop comments |
| `www/analog/src/app/components/Footer.ts` | Rewrite columns |
| `www/analog/src/app/app.component.ts` | Remove `Announcement` |
| `www/analog/src/app/pages/blog/[slug].page.ts` | Remove dead `.workshops` CSS |
| `www/analog/src/app/pages/docs/{react,angular}/start/platforms.md` | Rewrite the enterprise line |
| Blog posts in `www/analog/src/content/blog/` | Remove the workshop section and LiveLoveApp CTAs |
| `www/analog/package.json`, `package.json`, `package-lock.json` | Remove `firebase` |
| `www/analog/public/llms.txt`, `llms-full.txt` | Regenerate |

**Delete:**

- Home components: `components/home/{Hero,Samples,OpenSource,Features,Feature,Media,GettingStarted,TheVisual,Adapters}.ts`
- `components/hashy-skates/`
- Other components: `components/{Announcement,CoursesMenu,Products,LiveLoveAppButton}.ts`
- Icons: `icons/{BrandBlueSky,BrandLiveLoveApp,BrandLiveLoveAppWordmark}.ts`
- Workshops: `pages/workshops.page.ts`, `pages/workshops/`, `content/workshops/`, `models/workshop.models.ts`, `public/image/product/workshop/`
- Lead generation: `pages/contact-us/`, `services/FirebaseService.ts`

---

### Task 0: Baseline

**Files:** none

- [ ] **Step 1: Branch and dependencies**

Run:
```bash
git status --short && git rev-parse --abbrev-ref HEAD
ls node_modules/.bin/nx >/dev/null 2>&1 || npm ci --no-audit --no-fund
```
Expected:
- The branch is `blove/homepage-redesign`.
- The working tree is clean.
- `node_modules` is present.

- [ ] **Step 2: Baseline build and tests**

Run:
```bash
npx nx test www && npx nx lint www
```
Expected:
- Both succeed.
- Lint may print warnings; count them so later tasks don't add new ones.

---

### Task 1: Heading font token

**Files:**
- Modify: `www/analog/index.html`, lines 9-11 (the Google Fonts link)
- Modify: `www/analog/src/styles.css` (`:root` block)

- [ ] **Step 1: Load Inter Tight**

In `www/analog/index.html`, replace the Google Fonts `href` with:
```html
      href="https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
```

- [ ] **Step 2: Add the token**

In `www/analog/src/styles.css`, add as the last declarations inside the first `:root { ... }` block:
```css
  /* Typography */
  --font-heading: 'Inter Tight', 'Fredoka', system-ui, sans-serif;
```

- [ ] **Step 3: Verify the build**

Run: `npx nx build www`
Expected: `Successfully ran target build`.

- [ ] **Step 4: Commit**

```bash
git add www/analog/index.html www/analog/src/styles.css
git commit -m "feat(www): add Inter Tight heading font token"
```

---

### Task 2: Analytics service

**Files:**
- Create: `www/analog/src/app/services/AnalyticsService.ts`
- Test: `www/analog/src/app/services/AnalyticsService.spec.ts`

- [ ] **Step 1: Write the failing tests**

`www/analog/src/app/services/AnalyticsService.spec.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { trackEvent } from './AnalyticsService';

test('sends the event to Fathom when it is loaded', () => {
  const fathom = { trackEvent: vi.fn() };

  trackEvent('install-copied-react', { fathom });

  expect(fathom.trackEvent).toHaveBeenCalledWith('install-copied-react');
});

test('does nothing when Fathom is not loaded', () => {
  const target = {};

  const act = () => trackEvent('install-copied-react', target);

  expect(act).not.toThrow();
});

test('does nothing when there is no window', () => {
  const act = () => trackEvent('install-copied-react', undefined);

  expect(act).not.toThrow();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/services/AnalyticsService.spec.ts`
Expected: FAIL, because `./AnalyticsService` cannot be resolved.

- [ ] **Step 3: Implement**

`www/analog/src/app/services/AnalyticsService.ts`:
```ts
import { Injectable } from '@angular/core';

/**
 * Names of the homepage conversion events sent to Fathom.
 */
export type AnalyticsEvent =
  | 'install-copied-react'
  | 'install-copied-angular'
  | 'prompt-copied-react'
  | 'prompt-copied-angular'
  | 'quick-start-clicked'
  | 'threadplane-banner-clicked'
  | 'invoicing-demo-clicked';

/**
 * The subset of the Fathom client used by the site.
 */
export interface FathomClient {
  trackEvent(name: string): void;
}

/**
 * Send an event to Fathom. Does nothing during SSR or when Fathom is blocked or not loaded.
 *
 * @param name - The event name.
 * @param target - The object that may hold `fathom`. Defaults to `window` in the browser.
 */
export function trackEvent(
  name: AnalyticsEvent,
  target: { fathom?: FathomClient } | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as { fathom?: FathomClient }),
): void {
  target?.fathom?.trackEvent(name);
}

/**
 * Injectable wrapper around {@link trackEvent} for components.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  track(name: AnalyticsEvent): void {
    trackEvent(name);
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/services/AnalyticsService.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/services/AnalyticsService.ts www/analog/src/app/services/AnalyticsService.spec.ts
git commit -m "feat(www): add Fathom analytics event helper"
```

---

### Task 3: Homepage content module

**Files:**
- Create: `www/analog/src/app/components/home/home.content.ts`
- Test: `www/analog/src/app/components/home/home.content.spec.ts`

- [ ] **Step 1: Write the failing tests**

`www/analog/src/app/components/home/home.content.spec.ts`:
```ts
import { expect, test } from 'vitest';
import {
  agentPrompt,
  CAPABILITIES,
  HERO_CODE,
  installCommand,
  quickStartUrl,
  STEPS,
  THREADPLANE_URL,
} from './home.content';

test('installs the React packages for React', () => {
  const result = installCommand('react');

  expect(result).toBe('npm i @hashbrownai/{core,react,openai}');
});

test('installs the Angular packages for Angular', () => {
  const result = installCommand('angular');

  expect(result).toBe('npm i @hashbrownai/{core,angular,openai}');
});

test('points the agent prompt at llms.txt and the framework', () => {
  const result = agentPrompt('angular');

  expect(result).toContain('https://hashbrown.dev/llms.txt');
  expect(result).toContain('Angular');
  expect(result).toContain(installCommand('angular'));
});

test('links quick start to the selected framework', () => {
  const result = quickStartUrl('react');

  expect(result).toBe('/docs/react/start/quick');
});

test('uses the UI kit APIs in the hero code', () => {
  const react = HERO_CODE.react.code;
  const angular = HERO_CODE.angular.code;

  expect(react).toContain('useUiKit(');
  expect(react).toContain('useUiChat(');
  expect(angular).toContain('createUiKit(');
  expect(angular).toContain('uiChatResource(');
});

test('has three steps for each framework', () => {
  const counts = [STEPS.react.length, STEPS.angular.length];

  expect(counts).toEqual([3, 3]);
});

test('has six capability groups with docs links', () => {
  const paths = CAPABILITIES.map((capability) => capability.docsPath);

  expect(paths).toHaveLength(6);
  expect(paths.every((path) => path.length === 2)).toBe(true);
});

test('tags the threadplane link with hashbrown UTM parameters', () => {
  const url = new URL(THREADPLANE_URL);

  expect(url.hostname).toBe('threadplane.ai');
  expect(url.searchParams.get('utm_source')).toBe('hashbrown');
  expect(url.searchParams.get('utm_campaign')).toBe('headful_banner');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/home.content.spec.ts`
Expected: FAIL, because `./home.content` cannot be resolved.

- [ ] **Step 3: Implement**

`www/analog/src/app/components/home/home.content.ts`:
```ts
import { AppConfig } from '../../services/ConfigService';

/**
 * A framework the homepage can show.
 */
export type Sdk = AppConfig['sdk'];

/**
 * The display name for each framework.
 */
export const SDK_LABELS: Record<Sdk, string> = {
  react: 'React',
  angular: 'Angular',
};

/**
 * The npm install command for a framework.
 *
 * @param sdk - The selected framework.
 */
export function installCommand(sdk: Sdk): string {
  return `npm i @hashbrownai/{core,${sdk},openai}`;
}

/**
 * A prompt a developer can paste into a coding agent to add Hashbrown to their app.
 *
 * @param sdk - The selected framework.
 */
export function agentPrompt(sdk: Sdk): string {
  const name = SDK_LABELS[sdk];
  return [
    `Add Hashbrown to this ${name} app.`,
    `Read https://hashbrown.dev/llms.txt first and follow the ${name} quick start.`,
    `Install the packages with: ${installCommand(sdk)}`,
    'Add a small chat that renders one of our existing components with generative UI,',
    'and expose one read-only client-side tool. Keep the API key on the server.',
  ].join('\n');
}

/**
 * The quick start docs URL for a framework.
 *
 * @param sdk - The selected framework.
 */
export function quickStartUrl(sdk: Sdk): string {
  return `/docs/${sdk}/start/quick`;
}

/**
 * A code sample with its file name.
 */
export interface CodeSample {
  file: string;
  lang: string;
  code: string;
}

/**
 * The hero code sample for each framework.
 */
export const HERO_CODE: Record<Sdk, CodeSample> = {
  react: {
    file: 'Assistant.tsx',
    lang: 'tsx',
    code: `const invoiceKit = useUiKit({
  components: [
    exposeComponent(InvoiceCard, {
      description: 'Show one invoice',
      props: { id: s.string('Invoice id') },
    }),
    exposeComponent(AgingChart, { /* … */ }),
  ],
});

const chat = useUiChat({
  system: 'Help users understand invoices.',
  components: [invoiceKit],
});`,
  },
  angular: {
    file: 'assistant.component.ts',
    lang: 'typescript',
    code: `export const invoiceKit = createUiKit({
  components: [
    exposeComponent(InvoiceCard, {
      description: 'Show one invoice',
      input: { id: s.string('Invoice id') },
    }),
    exposeComponent(AgingChart, { /* … */ }),
  ],
});

chat = uiChatResource({
  system: 'Help users understand invoices.',
  components: [invoiceKit],
});`,
  },
};

/**
 * One step in the "How it works" section.
 */
export interface Step {
  title: string;
  body: string;
  code: string;
}

const STEP_COPY = [
  {
    title: 'Expose your components',
    body: 'The model can only render what you register, with props validated by a Skillet schema.',
  },
  {
    title: 'Give it tools',
    body: "Tools run in the browser, with your app's state and services.",
  },
  {
    title: 'Render the stream',
    body: 'Components render as they stream in. No waiting for the full response.',
  },
];

/**
 * The three "How it works" steps for each framework.
 */
export const STEPS: Record<Sdk, Step[]> = {
  react: [
    {
      ...STEP_COPY[0],
      code: `exposeComponent(AgingChart, {
  props: { buckets: s.array(…) },
})`,
    },
    {
      ...STEP_COPY[1],
      code: `useTool({
  name: 'getInvoices',
  handler: () => api.list(),
})`,
    },
    {
      ...STEP_COPY[2],
      code: `chat.messages.map((m) =>
  m.ui ?? m.content
)`,
    },
  ],
  angular: [
    {
      ...STEP_COPY[0],
      code: `exposeComponent(AgingChart, {
  input: { buckets: s.array(…) },
})`,
    },
    {
      ...STEP_COPY[1],
      code: `createTool({
  name: 'getInvoices',
  handler: () => api.list(),
})`,
    },
    {
      ...STEP_COPY[2],
      code: `<hb-render-message [message]="m" />`,
    },
  ],
};

/**
 * One capability group on the homepage.
 */
export interface Capability {
  title: string;
  body: string;
  why: string;
  docsPath: [string, string];
  tint: string;
}

/**
 * The six capability groups. `docsPath` is relative to `/docs/{sdk}/`.
 */
export const CAPABILITIES: Capability[] = [
  {
    title: 'Generative UI',
    body: 'The model composes your trusted components. UI kits bundle them for reuse.',
    why: 'Only your components, never arbitrary HTML',
    docsPath: ['concept', 'components'],
    tint: 'var(--sunshine-yellow-light)',
  },
  {
    title: 'Client-side tools',
    body: "Call your app's functions from the model, and connect MCP servers when you need them.",
    why: 'Runs in the browser, not just on a server',
    docsPath: ['concept', 'functions'],
    tint: 'var(--sky-blue-light)',
  },
  {
    title: 'Structured output',
    body: 'Skillet schemas give you typed JSON you can use directly.',
    why: 'A schema language built for LLMs and streaming',
    docsPath: ['concept', 'structured-output'],
    tint: 'var(--sunset-orange-light)',
  },
  {
    title: 'Streaming, everywhere',
    body: 'Strings, arrays and objects parse as they arrive. Magic Text streams markdown.',
    why: 'Incremental parser, low latency',
    docsPath: ['concept', 'streaming'],
    tint: 'var(--olive-green-light)',
  },
  {
    title: 'Any model',
    body: 'OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama, and local browser models.',
    why: 'Swap providers without rewriting UI',
    docsPath: ['platform', 'openai'],
    tint: 'var(--sunshine-yellow-light)',
  },
  {
    title: 'Safe code execution',
    body: 'A sandboxed JavaScript runtime for model-written code.',
    why: 'Charts and transforms without eval',
    docsPath: ['concept', 'runtime'],
    tint: 'var(--sky-blue-light)',
  },
];

/**
 * The threadplane link used by the homepage banner.
 */
export const THREADPLANE_URL =
  'https://threadplane.ai/?utm_source=hashbrown&utm_medium=homepage&utm_campaign=headful_banner';

/**
 * External links for the invoicing showcase.
 */
export const INVOICING_LINKS = {
  app: 'https://invoicing.hashbrown.dev',
  source:
    'https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing',
  b4: 'https://b4.run',
  pretable: 'https://pretable.ai',
} as const;

/**
 * The Hashbrown GitHub repository.
 */
export const GITHUB_URL = 'https://github.com/liveloveapp/hashbrown';
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/home.content.spec.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/components/home/home.content.ts www/analog/src/app/components/home/home.content.spec.ts
git commit -m "feat(www): add homepage content module"
```

---

### Task 4: Copy helper

**Files:**
- Create: `www/analog/src/app/components/home/copy-text.ts`
- Test: `www/analog/src/app/components/home/copy-text.spec.ts`

- [ ] **Step 1: Write the failing tests**

`www/analog/src/app/components/home/copy-text.spec.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { copyText } from './copy-text';

test('writes the text to the clipboard and tracks the event', async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard,
    track,
  });

  expect(result).toBe(true);
  expect(clipboard.writeText).toHaveBeenCalledWith('npm i x');
  expect(track).toHaveBeenCalledWith('install-copied-react');
});

test('reports failure and does not track when the clipboard rejects', async () => {
  const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('no')) };
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard,
    track,
  });

  expect(result).toBe(false);
  expect(track).not.toHaveBeenCalled();
});

test('reports failure when there is no clipboard', async () => {
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard: undefined,
    track,
  });

  expect(result).toBe(false);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/copy-text.spec.ts`
Expected: FAIL, because `./copy-text` cannot be resolved.

- [ ] **Step 3: Implement**

`www/analog/src/app/components/home/copy-text.ts`:
```ts
import { AnalyticsEvent } from '../../services/AnalyticsService';

/**
 * Dependencies for {@link copyText}. Passed in so the function stays pure and testable.
 */
export interface CopyTextDeps {
  clipboard: Pick<Clipboard, 'writeText'> | undefined;
  track: (event: AnalyticsEvent) => void;
}

/**
 * Copy text to the clipboard and track the event only if the copy succeeded.
 *
 * @param text - The text to copy.
 * @param event - The analytics event to send on success.
 * @param deps - The clipboard and tracker to use.
 * @returns Whether the copy succeeded.
 */
export async function copyText(
  text: string,
  event: AnalyticsEvent,
  deps: CopyTextDeps,
): Promise<boolean> {
  if (!deps.clipboard) {
    return false;
  }
  try {
    await deps.clipboard.writeText(text);
  } catch {
    return false;
  }
  deps.track(event);
  return true;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/copy-text.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/components/home/copy-text.ts www/analog/src/app/components/home/copy-text.spec.ts
git commit -m "feat(www): add tracked clipboard copy helper"
```

---

### Task 5: Latest posts selector

**Files:**
- Create: `www/analog/src/app/components/home/latest-posts.ts`
- Test: `www/analog/src/app/components/home/latest-posts.spec.ts`

Blog post slugs start with `YYYY-MM-DD`. `pages/blog/index.page.ts` already derives dates this way. This task pulls that logic into a pure function.

- [ ] **Step 1: Write the failing tests**

`www/analog/src/app/components/home/latest-posts.spec.ts`:
```ts
import { expect, test } from 'vitest';
import { selectLatestPosts } from './latest-posts';

const post = (slug: string) => ({
  filename: `/src/content/blog/${slug}.md`,
  slug,
  attributes: { slug, title: slug, description: '', tags: [], team: [] },
});

test('returns the newest posts first, limited to the count', () => {
  const files = [
    post('2025-06-25-launch'),
    post('2026-07-09-v5'),
    post('2025-12-16-v4'),
    post('2025-10-22-grid'),
  ];

  const result = selectLatestPosts(files, 3);

  expect(result.map((p) => p.attributes.slug)).toEqual([
    '2026-07-09-v5',
    '2025-12-16-v4',
    '2025-10-22-grid',
  ]);
});

test('adds a date parsed from the slug', () => {
  const files = [post('2026-07-09-v5')];

  const [result] = selectLatestPosts(files, 3);

  expect(result.attributes.date?.toISOString().slice(0, 10)).toBe(
    '2026-07-09',
  );
});

test('does not mutate the input', () => {
  const files = [post('2025-06-25-launch'), post('2026-07-09-v5')];
  const before = files.map((p) => p.attributes.slug);

  selectLatestPosts(files, 1);

  expect(files.map((p) => p.attributes.slug)).toEqual(before);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/latest-posts.spec.ts`
Expected: FAIL, because `./latest-posts` cannot be resolved.

- [ ] **Step 3: Implement**

`www/analog/src/app/components/home/latest-posts.ts`:
```ts
import { ContentFile } from '@analogjs/content';
import { PostAttributes } from '../../models/blog.models';

/**
 * Return the newest blog posts, each with a `date` parsed from its `YYYY-MM-DD` slug prefix.
 *
 * @param files - Blog content files.
 * @param count - How many posts to return.
 */
export function selectLatestPosts<
  T extends Pick<ContentFile<PostAttributes>, 'attributes'>,
>(
  files: readonly T[],
  count: number,
): Array<T & { attributes: T['attributes'] & { date: Date } }> {
  return files
    .map((file) => ({
      ...file,
      attributes: {
        ...file.attributes,
        date: new Date(file.attributes.slug.slice(0, 10)),
      },
    }))
    .sort(
      (a, b) =>
        (b.attributes.date.getTime() || 0) - (a.attributes.date.getTime() || 0),
    )
    .slice(0, count);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run --config www/analog/vite.config.ts www/analog/src/app/components/home/latest-posts.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/components/home/latest-posts.ts www/analog/src/app/components/home/latest-posts.spec.ts
git commit -m "feat(www): add latest blog posts selector"
```

---

### Task 6: InstallCommand component

**Files:**
- Create: `www/analog/src/app/components/home/InstallCommand.ts`

`InstallCommand` is used in the hero and in the closing CTA. The framework toggle writes to `ConfigService`, so both instances and every code sample stay in sync.

- [ ] **Step 1: Implement**

`www/analog/src/app/components/home/InstallCommand.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { ToastService } from '../../services/ToastService';
import { copyText } from './copy-text';
import { installCommand, Sdk, SDK_LABELS } from './home.content';

@Component({
  selector: 'www-install-command',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.centered]': 'centered()' },
  template: `
    <div class="tabs" role="tablist" aria-label="Framework">
      @for (option of sdks; track option) {
        <button
          role="tab"
          [attr.aria-selected]="sdk() === option"
          [class.on]="sdk() === option"
          (click)="select(option)"
        >
          {{ labels[option] }}
        </button>
      }
    </div>
    <div class="command">
      <code>{{ command() }}</code>
      <button class="copy" (click)="copy()" aria-label="Copy install command">
        Copy
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
    }

    :host(.centered) {
      align-items: center;
    }

    .tabs {
      display: inline-flex;
      padding: 4px;
      background: #fff;
      border: 1px solid rgba(232, 162, 61, 0.4);
      border-radius: 12px;
    }

    .tabs button {
      font: 600 14px/1 'Fredoka', sans-serif;
      padding: 8px 16px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--gray);
      cursor: pointer;
    }

    .tabs button.on {
      background: var(--sunshine-yellow);
      color: var(--gray-dark);
    }

    .command {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      max-width: 520px;
      padding: 14px 16px;
      background: #fff;
      border: 2px solid var(--sunshine-yellow);
      border-radius: 14px;
      color: var(--chocolate-brown);
    }

    .command code {
      font: 500 15px/1.4 'JetBrains Mono', monospace;
      overflow-x: auto;
      white-space: nowrap;
    }

    .copy {
      flex-shrink: 0;
      font: 600 13px/1 'Fredoka', sans-serif;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: var(--sunshine-yellow-light);
      color: var(--chocolate-brown);
      cursor: pointer;
    }
  `,
})
export class InstallCommand {
  private readonly config = inject(ConfigService);
  private readonly analytics = inject(AnalyticsService);
  private readonly toast = inject(ToastService);

  /** Center the tabs and command, used by the closing CTA. */
  readonly centered = input(false);

  readonly sdks: Sdk[] = ['react', 'angular'];
  readonly labels = SDK_LABELS;
  readonly sdk = this.config.sdk;
  readonly command = computed(() => installCommand(this.sdk()));

  select(sdk: Sdk): void {
    this.config.set({ sdk });
  }

  async copy(): Promise<void> {
    const copied = await copyText(
      this.command(),
      `install-copied-${this.sdk()}` as const,
      {
        clipboard: globalThis.navigator?.clipboard,
        track: (event) => this.analytics.track(event),
      },
    );
    if (copied) {
      this.toast.success('Install command copied', { position: 'top-center' });
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx nx build www`
Expected: success. The component isn't used yet, so no bundle change is expected.

- [ ] **Step 3: Commit**

```bash
git add www/analog/src/app/components/home/InstallCommand.ts
git commit -m "feat(www): add framework-aware install command"
```

---

### Task 7: HomeHero

**Files:**
- Create: `www/analog/src/app/components/home/HomeHero.ts`

- [ ] **Step 1: Implement**

`www/analog/src/app/components/home/HomeHero.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeHighlight } from '../../pipes/CodeHighlight';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { ToastService } from '../../services/ToastService';
import { GitHubStarButton } from '../GitHubStarButton';
import { copyText } from './copy-text';
import { agentPrompt, HERO_CODE, quickStartUrl } from './home.content';
import { InstallCommand } from './InstallCommand';

@Component({
  selector: 'www-home-hero',
  imports: [CodeHighlight, GitHubStarButton, InstallCommand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="copy">
      <h1>AI chat and agents for your React or Angular app</h1>
      <p class="lead">
        Hashbrown is a headless TypeScript framework. Let the model render your
        own components, run tools in the browser, and stream typed output from
        any model.
      </p>
      <www-install-command />
      <div class="actions">
        <a
          class="btn primary"
          [routerLink]="quickStart()"
          (click)="analytics.track('quick-start-clicked')"
          >Quick start →</a
        >
        <button class="btn" (click)="copyPrompt()">
          Copy prompt for your coding agent
        </button>
      </div>
      <div class="proof">
        <www-github-star-button />
        <span>MIT licensed</span>
        <span>OpenAI · Anthropic · Gemini · Bedrock · Azure · Ollama</span>
      </div>
    </div>
    <div class="panel">
      <div class="bar">
        <span class="dot"></span><span class="dot"></span
        ><span class="dot"></span>
        <span class="file">{{ sample().file }}</span>
      </div>
      <div class="code" [innerHTML]="sample().code | codeHighlight: sample().lang"></div>
      <div class="result" aria-hidden="true">
        <div class="bubble">Show me Acme's overdue invoice</div>
        <div class="invoice">
          <strong>INV-1042 · Acme Corp</strong>
          <span class="tag">62 days overdue</span>
          <span>$12,480.00 · due Jul 22</span>
        </div>
        <div class="streaming">
          &lt;InvoiceCard&gt; streaming <span class="caret"></span>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr;
      gap: 40px;
      align-items: center;
      padding: 48px 0;
    }

    h1 {
      font: 800 40px/1.04 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .lead {
      margin: 20px 0 28px;
      max-width: 540px;
      font: 400 19px/1.55 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      padding: 11px 18px;
      border: 1.5px solid var(--chocolate-brown);
      border-radius: 12px;
      background: #fff;
      color: var(--chocolate-brown);
      font: 600 15px/1 'Fredoka', sans-serif;
      cursor: pointer;
      text-decoration: none;
    }

    .btn.primary {
      background: var(--chocolate-brown);
      color: #fff;
    }

    .proof {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
      margin-top: 22px;
      font: 400 14px/1.4 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .panel {
      min-width: 0;
      overflow: hidden;
      background: #fff;
      border: 1px solid rgba(232, 162, 61, 0.33);
      border-radius: 18px;
      box-shadow: 0 18px 50px rgba(119, 70, 37, 0.1);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      font: 400 12px/1 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e7e3d6;
    }

    .file {
      margin-left: 8px;
    }

    .code {
      padding: 16px 18px;
      overflow-x: auto;
      font: 400 12.5px/1.6 'JetBrains Mono', monospace;
      color: var(--gray-dark);
    }

    .result {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      border-top: 1px dashed rgba(232, 162, 61, 0.55);
      background: var(--vanilla-ivory);
      font: 400 14px/1.4 'Fredoka', sans-serif;
    }

    .bubble {
      align-self: flex-end;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--sunshine-yellow-light);
    }

    .invoice {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 12px;
      padding: 12px 14px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      background: #fff;
    }

    .invoice strong {
      font: 700 15px/1.3 var(--font-heading);
    }

    .tag {
      padding: 1px 8px;
      border-radius: 6px;
      background: var(--sunset-orange-light);
      color: var(--indian-red-dark);
      font-size: 12px;
    }

    .streaming {
      font-size: 12px;
      color: var(--chocolate-brown-light);
    }

    .caret {
      display: inline-block;
      width: 7px;
      height: 14px;
      vertical-align: -2px;
      background: var(--sunset-orange);
      animation: blink 1s steps(2) infinite;
    }

    @keyframes blink {
      50% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .caret {
        animation: none;
      }
    }

    @media screen and (min-width: 1024px) {
      :host {
        grid-template-columns: 1.02fr 1fr;
        gap: 56px;
        padding: 64px 0 56px;
      }

      h1 {
        font-size: 58px;
        line-height: 1.02;
      }
    }
  `,
})
export class HomeHero {
  private readonly config = inject(ConfigService);
  private readonly toast = inject(ToastService);
  readonly analytics = inject(AnalyticsService);

  readonly sample = computed(() => HERO_CODE[this.config.sdk()]);
  readonly quickStart = computed(() => quickStartUrl(this.config.sdk()));

  async copyPrompt(): Promise<void> {
    const sdk = this.config.sdk();
    const copied = await copyText(agentPrompt(sdk), `prompt-copied-${sdk}` as const, {
      clipboard: globalThis.navigator?.clipboard,
      track: (event) => this.analytics.track(event),
    });
    if (copied) {
      this.toast.success('Prompt copied. Paste it into your coding agent.', {
        position: 'top-center',
      });
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx nx build www`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add www/analog/src/app/components/home/HomeHero.ts
git commit -m "feat(www): add install-first homepage hero"
```

---

### Task 8: WorksWith, HowItWorks, Capabilities

**Files:**
- Create: `www/analog/src/app/components/home/WorksWith.ts`
- Create: `www/analog/src/app/components/home/HowItWorks.ts`
- Create: `www/analog/src/app/components/home/Capabilities.ts`

- [ ] **Step 1: WorksWith**

`www/analog/src/app/components/home/WorksWith.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Anthropic } from './providers/Anthropic';
import { Bedrock } from './providers/Bedrock';
import { Gemini } from './providers/Gemini';
import { Ollama } from './providers/Ollama';
import { OpenAi } from './providers/OpenAi';

@Component({
  selector: 'www-works-with',
  imports: [Anthropic, Bedrock, Gemini, Ollama, OpenAi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <small>Works with</small>
    <span class="provider"><app-home-openai /> OpenAI</span>
    <span class="provider"><app-home-anthropic /> Anthropic</span>
    <span class="provider"><app-home-gemini /> Gemini</span>
    <span class="provider"><app-home-bedrock /> Bedrock</span>
    <span class="provider">Azure</span>
    <span class="provider"><app-home-ollama /> Ollama</span>
    <span class="provider">Chrome / Edge local models</span>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 16px 32px;
      padding: 22px 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      background: rgba(255, 255, 255, 0.55);
      font: 500 15px/1 'Fredoka', sans-serif;
      color: var(--gray);
    }

    small {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--chocolate-brown-light);
    }

    .provider {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .provider ::ng-deep svg {
      width: 24px;
      height: 24px;
    }
  `,
})
export class WorksWith {}
```

Check the selectors first. Run `grep -n "selector" www/analog/src/app/components/home/providers/*.ts` and use the exact selectors it prints; `OpenAi` is `app-home-openai`. If a provider component renders its own label, drop the text label next to it so the name doesn't appear twice.

- [ ] **Step 2: HowItWorks**

`www/analog/src/app/components/home/HowItWorks.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CodeHighlight } from '../../pipes/CodeHighlight';
import { ConfigService } from '../../services/ConfigService';
import { STEPS } from './home.content';

@Component({
  selector: 'www-how-it-works',
  imports: [CodeHighlight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h2>How it works</h2>
      <p>Three pieces. Same API in React and Angular.</p>
    </header>
    <ol>
      @for (step of steps(); track step.title; let i = $index) {
        <li>
          <span class="num">{{ i + 1 }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
          <div class="code" [innerHTML]="step.code | codeHighlight"></div>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      padding: 72px 0;
    }

    header {
      max-width: 640px;
      margin-bottom: 32px;
    }

    h2 {
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    header p {
      margin-top: 12px;
      font: 400 17px/1.5 'Fredoka', sans-serif;
      color: var(--gray);
    }

    ol {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
    }

    .num {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      margin-bottom: 12px;
      border-radius: 50%;
      background: var(--sunshine-yellow);
      font: 800 15px/1 var(--font-heading);
      color: var(--gray-dark);
    }

    h3 {
      margin-bottom: 6px;
      font: 700 20px/1.2 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    li p {
      margin-bottom: 14px;
      font: 400 15px/1.5 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .code {
      margin-top: auto;
      padding: 12px 14px;
      overflow-x: auto;
      border-radius: 12px;
      background: var(--vanilla-ivory);
      font: 400 12px/1.6 'JetBrains Mono', monospace;
    }

    @media screen and (min-width: 1024px) {
      ol {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class HowItWorks {
  private readonly config = inject(ConfigService);
  readonly steps = computed(() => STEPS[this.config.sdk()]);
}
```

- [ ] **Step 3: Capabilities**

`www/analog/src/app/components/home/Capabilities.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { CAPABILITIES, Capability } from './home.content';

@Component({
  selector: 'www-capabilities',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h2>Everything you need to build it</h2>
      <p>
        A small set of primitives that compose into chat, copilots, and agents.
      </p>
    </header>
    <div class="grid">
      @for (capability of capabilities; track capability.title) {
        <article>
          <span class="swatch" [style.background]="capability.tint"></span>
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.body }}</p>
          <div class="why">{{ capability.why }}</div>
          <a [routerLink]="docsLink(capability)">Read the docs</a>
        </article>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    header {
      max-width: 640px;
      margin-bottom: 32px;
    }

    h2 {
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    header p {
      margin-top: 12px;
      font: 400 17px/1.5 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    article {
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
    }

    .swatch {
      display: block;
      width: 40px;
      height: 40px;
      margin-bottom: 12px;
      border-radius: 12px;
    }

    h3 {
      margin-bottom: 6px;
      font: 700 20px/1.2 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    p {
      margin-bottom: 12px;
      font: 400 15px/1.5 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .why {
      font: 600 13.5px/1.4 'Fredoka', sans-serif;
      color: var(--sunset-orange);
    }

    a {
      display: inline-block;
      margin-top: 12px;
      font: 500 14px/1 'Fredoka', sans-serif;
      color: var(--chocolate-brown);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    @media screen and (min-width: 768px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media screen and (min-width: 1024px) {
      .grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class Capabilities {
  private readonly config = inject(ConfigService);
  readonly capabilities = CAPABILITIES;

  docsLink(capability: Capability): string {
    return `/docs/${this.config.sdk()}/${capability.docsPath.join('/')}`;
  }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx nx build www`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add www/analog/src/app/components/home/WorksWith.ts www/analog/src/app/components/home/HowItWorks.ts www/analog/src/app/components/home/Capabilities.ts
git commit -m "feat(www): add works-with, how-it-works, and capability sections"
```

---

### Task 9: Image assets

**Files:**
- Create: `www/analog/public/image/landing-page/threadplane/brian-skeptical.webp`
- Create: `www/analog/public/image/landing-page/invoicing.jpg`

- [ ] **Step 1: Export the banner photo**

Run:
```bash
mkdir -p www/analog/public/image/landing-page/threadplane
python3 - <<'EOF'
from PIL import Image
import os
src = Image.open(os.path.expanduser(
    '~/Pictures/headshot-pilot-production-kit/portraits/BL-003_skeptical-thinking_lettering-cleaned_v01.png'))
w, h = src.size
top = max(src.getbbox()[1] - int(h * 0.03), 0)
img = src.crop((0, top, w, h))
img.thumbnail((900, 900))
img.save('www/analog/public/image/landing-page/threadplane/brian-skeptical.webp', 'WEBP', quality=86, method=6)
print(img.size)
EOF
ls -la www/analog/public/image/landing-page/threadplane/
```
Expected:
- Prints a size about 790×900.
- The file is under 150 KB and keeps its transparency.

Check it by reading the file with the Read tool:
- The background is transparent.
- There's no brand lettering on the jacket.
- The right and bottom edges are the cropped edges.

- [ ] **Step 2: Capture the invoicing screenshot**

Run:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1440,900 --virtual-time-budget=15000 --screenshot=/tmp/invoicing.png https://invoicing.hashbrown.dev
sips -s format jpeg -s formatOptions 82 -Z 1400 /tmp/invoicing.png --out www/analog/public/image/landing-page/invoicing.jpg
```
Expected: the JPEG exists and is under 300 KB.

Read it with the Read tool to confirm it shows the app with data loaded, not a loading screen. If it shows a loading screen:
1. Retry with `--virtual-time-budget=30000`.
2. If it still loads, take the screenshot manually in the browser pane and save it to the same path.

- [ ] **Step 3: Commit**

```bash
git add www/analog/public/image/landing-page/threadplane/brian-skeptical.webp www/analog/public/image/landing-page/invoicing.jpg
git commit -m "feat(www): add homepage banner photo and invoicing screenshot"
```

---

### Task 10: RealApp and ThreadplaneBanner

**Files:**
- Create: `www/analog/src/app/components/home/RealApp.ts`
- Create: `www/analog/src/app/components/home/ThreadplaneBanner.ts`

- [ ] **Step 1: RealApp**

`www/analog/src/app/components/home/RealApp.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { INVOICING_LINKS } from './home.content';

@Component({
  selector: 'www-real-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="copy">
        <h2>See it in a real app</h2>
        <p>
          An invoicing assistant that reads the ledger, explains balances, and
          renders tables and charts from your components. Data is simulated.
        </p>
        <div class="built">
          <div class="tile">
            <small>Generative UI</small><strong>hashbrown</strong
            ><span>Chat, tools, streamed components</span>
          </div>
          <a class="tile" [href]="links.b4" target="_blank" rel="noopener">
            <small>Agent backend</small><strong>b4.run ↗</strong
            ><span>TypeScript agents on LangGraph.js</span>
          </a>
          <a class="tile" [href]="links.pretable" target="_blank" rel="noopener">
            <small>Data grid</small><strong>pretable.ai ↗</strong
            ><span>Fast React grid for streaming data</span>
          </a>
        </div>
        <div class="actions">
          <a
            class="btn primary"
            [href]="links.app"
            target="_blank"
            rel="noopener"
            (click)="analytics.track('invoicing-demo-clicked')"
            >Try the app ↗</a
          >
          <a class="btn" [href]="links.source" target="_blank" rel="noopener"
            >Read the source</a
          >
        </div>
      </div>
      <a
        class="shot"
        [href]="links.app"
        target="_blank"
        rel="noopener"
        (click)="analytics.track('invoicing-demo-clicked')"
      >
        <img
          src="/image/landing-page/invoicing.jpg"
          alt="The Hashbrown invoicing example: an invoice grid next to an AI assistant chat"
          loading="lazy"
          width="1400"
          height="875"
        />
      </a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .card {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      align-items: center;
      padding: 28px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 24px;
      background: #fff;
    }

    h2 {
      font: 800 36px/1.1 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    p {
      margin-top: 12px;
      font: 400 16px/1.55 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .built {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin: 22px 0;
    }

    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px;
      border-radius: 14px;
      background: var(--vanilla-ivory);
      color: inherit;
      text-decoration: none;
    }

    .tile small {
      font: 600 10.5px/1.2 'Fredoka', sans-serif;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--sunset-orange);
    }

    .tile strong {
      font: 700 17px/1.3 var(--font-heading);
      color: var(--gray-dark);
    }

    .tile span {
      font: 400 13.5px/1.4 'Fredoka', sans-serif;
      color: var(--gray);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn {
      display: inline-flex;
      padding: 11px 18px;
      border: 1.5px solid var(--chocolate-brown);
      border-radius: 12px;
      background: #fff;
      color: var(--chocolate-brown);
      font: 600 15px/1 'Fredoka', sans-serif;
      text-decoration: none;
    }

    .btn.primary {
      background: var(--chocolate-brown);
      color: #fff;
    }

    .shot img {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 16px;
    }

    @media screen and (min-width: 1024px) {
      .card {
        grid-template-columns: 0.9fr 1.1fr;
        gap: 36px;
        padding: 36px;
      }

      .built {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class RealApp {
  readonly analytics = inject(AnalyticsService);
  readonly links = INVOICING_LINKS;
}
```

- [ ] **Step 2: ThreadplaneBanner**

`www/analog/src/app/components/home/ThreadplaneBanner.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { THREADPLANE_URL } from './home.content';

@Component({
  selector: 'www-threadplane-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="banner"
      [href]="url"
      target="_blank"
      rel="noopener"
      (click)="analytics.track('threadplane-banner-clicked')"
    >
      <div class="text">
        <div class="eyebrow"><span class="plane"></span>threadplane</div>
        <div class="big">Your chat UI<br /><em>isn't done.</em></div>
        <p>
          Threads, approvals, tool progress, retries. threadplane is the whole
          agent UI for React and Angular, free and MIT, with enterprise support
          from the team that built both.
        </p>
        <span class="cta">Explore threadplane →</span>
      </div>
      <img
        src="/image/landing-page/threadplane/brian-skeptical.webp"
        alt="Brian Love"
        loading="lazy"
        width="790"
        height="900"
      />
    </a>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .banner {
      position: relative;
      display: block;
      min-height: 380px;
      overflow: hidden;
      border-radius: 24px;
      background: radial-gradient(
        120% 140% at 82% 18%,
        #22385c 0%,
        #15253e 45%,
        #0c1626 100%
      );
      color: #fff;
      text-decoration: none;
    }

    .text {
      position: relative;
      z-index: 1;
      max-width: 620px;
      padding: 36px 24px 240px;
    }

    .eyebrow {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 18px;
      font: 600 12px/1 var(--font-heading);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      opacity: 0.75;
    }

    .plane {
      width: 16px;
      height: 16px;
      background: #ffaf00;
      clip-path: polygon(0 50%, 100% 0, 70% 100%, 50% 60%);
    }

    .big {
      font: 900 40px/0.98 var(--font-heading);
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }

    .big em {
      font-style: normal;
      color: #ff6b4a;
    }

    p {
      max-width: 500px;
      margin: 20px 0 26px;
      font: 500 17px/1.5 var(--font-heading);
      opacity: 0.88;
    }

    .cta {
      display: inline-block;
      padding: 13px 20px;
      border-radius: 10px;
      background: #ffaf00;
      color: #0a0a0a;
      font: 700 16px/1 var(--font-heading);
    }

    img {
      position: absolute;
      right: 0;
      bottom: 0;
      width: auto;
      height: 240px;
    }

    @media screen and (min-width: 1024px) {
      .text {
        padding: 56px 0 56px 56px;
      }

      .big {
        font-size: 64px;
      }

      img {
        height: 100%;
        max-height: 420px;
      }
    }
  `,
})
export class ThreadplaneBanner {
  readonly analytics = inject(AnalyticsService);
  readonly url = THREADPLANE_URL;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx nx build www`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add www/analog/src/app/components/home/RealApp.ts www/analog/src/app/components/home/ThreadplaneBanner.ts
git commit -m "feat(www): add invoicing showcase and threadplane banner"
```

---

### Task 11: LatestPosts and ClosingCta

**Files:**
- Create: `www/analog/src/app/components/home/LatestPosts.ts`
- Create: `www/analog/src/app/components/home/ClosingCta.ts`

- [ ] **Step 1: LatestPosts**

`www/analog/src/app/components/home/LatestPosts.ts`:
```ts
import { injectContentFiles } from '@analogjs/content';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostAttributes } from '../../models/blog.models';
import { selectLatestPosts } from './latest-posts';

@Component({
  selector: 'www-latest-posts',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>From the blog</h2>
    <div class="posts">
      @for (post of posts; track post.slug) {
        <a [routerLink]="['/blog', post.attributes.slug]">
          <small>{{ post.attributes.date | date: 'mediumDate' : 'UTC' }}</small>
          <h3>{{ post.attributes.title }}</h3>
          <p>{{ post.attributes.description }}</p>
        </a>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    h2 {
      margin-bottom: 32px;
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .posts {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    a {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
      color: inherit;
      text-decoration: none;
    }

    small {
      font: 400 13px/1 'Fredoka', sans-serif;
      color: var(--chocolate-brown-light);
    }

    h3 {
      font: 700 19px/1.25 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    p {
      font: 400 14.5px/1.5 'Fredoka', sans-serif;
      color: var(--gray);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @media screen and (min-width: 1024px) {
      .posts {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class LatestPosts {
  readonly posts = selectLatestPosts(
    injectContentFiles<PostAttributes>((file) =>
      file.filename.includes('/src/content/blog/'),
    ),
    3,
  );
}
```

- [ ] **Step 2: ClosingCta**

`www/analog/src/app/components/home/ClosingCta.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { GITHUB_URL, quickStartUrl } from './home.content';
import { InstallCommand } from './InstallCommand';

@Component({
  selector: 'www-closing-cta',
  imports: [InstallCommand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <img src="/image/logo/brand-mark.svg" alt="" width="56" height="56" />
      <h2>Start building in five minutes</h2>
      <www-install-command [centered]="true" />
      <div class="actions">
        <a
          class="btn primary"
          [routerLink]="quickStart()"
          (click)="analytics.track('quick-start-clicked')"
          >Quick start →</a
        >
        <a class="btn" [href]="github" target="_blank" rel="noopener"
          >★ Star on GitHub</a
        >
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 56px 24px;
      border-radius: 28px;
      background: var(--sunshine-yellow-light);
      text-align: center;
    }

    h2 {
      font: 800 36px/1.1 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
    }

    .btn {
      display: inline-flex;
      padding: 11px 18px;
      border: 1.5px solid var(--chocolate-brown);
      border-radius: 12px;
      background: #fff;
      color: var(--chocolate-brown);
      font: 600 15px/1 'Fredoka', sans-serif;
      text-decoration: none;
    }

    .btn.primary {
      background: var(--chocolate-brown);
      color: #fff;
    }

    @media screen and (min-width: 1024px) {
      h2 {
        font-size: 44px;
      }
    }
  `,
})
export class ClosingCta {
  private readonly config = inject(ConfigService);
  readonly analytics = inject(AnalyticsService);
  readonly github = GITHUB_URL;
  readonly quickStart = computed(() => quickStartUrl(this.config.sdk()));
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx nx build www`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add www/analog/src/app/components/home/LatestPosts.ts www/analog/src/app/components/home/ClosingCta.ts
git commit -m "feat(www): add latest posts and closing install CTA"
```

---

### Task 12: Assemble the homepage and delete the old sections

**Files:**
- Modify: `www/analog/src/app/pages/(home).page.ts`
- Delete: `www/analog/src/app/components/home/{Hero,Samples,OpenSource,Features,Feature,Media,GettingStarted,TheVisual,Adapters}.ts`
- Delete: `www/analog/src/app/components/hashy-skates/`

- [ ] **Step 1: Rewrite the page**

Replace the imports and the `@Component` block in `www/analog/src/app/pages/(home).page.ts`. Keep `routeMeta`, but update its description.
```ts
import { RouteMeta } from '@analogjs/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Capabilities } from '../components/home/Capabilities';
import { ClosingCta } from '../components/home/ClosingCta';
import { HomeHero } from '../components/home/HomeHero';
import { HowItWorks } from '../components/home/HowItWorks';
import { LatestPosts } from '../components/home/LatestPosts';
import { RealApp } from '../components/home/RealApp';
import { ThreadplaneBanner } from '../components/home/ThreadplaneBanner';
import { WorksWith } from '../components/home/WorksWith';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown: AI chat and agents for React and Angular',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown: AI chat and agents for React and Angular',
    },
    {
      name: 'og:description',
      content:
        'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [
    Capabilities,
    ClosingCta,
    Footer,
    Header,
    HomeHero,
    HowItWorks,
    LatestPosts,
    RealApp,
    ThreadplaneBanner,
    WorksWith,
  ],
  template: `
    <www-header />
    <main>
      <div class="wrap"><www-home-hero /></div>
      <www-works-with />
      <div class="wrap">
        <www-how-it-works />
        <www-capabilities />
        <www-real-app />
        <www-threadplane-banner />
        <www-latest-posts />
        <www-closing-cta />
      </div>
    </main>
    <www-footer />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-repeat: repeat;
      background-attachment: fixed;
    }

    .wrap {
      width: 100%;
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 16px;
    }

    @media screen and (min-width: 768px) {
      .wrap {
        padding: 0 32px;
      }
    }
  `,
})
export default class HomePage {}
```
Before replacing, check the existing class name and whether the header needs a transparent background. Keep any existing `:host ::ng-deep www-header` rule from the current file.

- [ ] **Step 2: Delete the replaced components**

Run:
```bash
cd www/analog/src/app/components
git rm -q home/Hero.ts home/Samples.ts home/OpenSource.ts home/Features.ts home/Feature.ts home/Media.ts home/GettingStarted.ts home/TheVisual.ts home/Adapters.ts
git rm -rq hashy-skates
cd -
grep -rn "home/Hero'\|home/Samples'\|home/OpenSource'\|home/Features'\|home/Feature'\|home/Media'\|GettingStarted\|TheVisual\|home/Adapters'\|hashy-skates\|VideoOverlay" www/analog/src/app --include=*.ts
```
Expected:
- The only grep hits are the definition of `VideoOverlay` and any other remaining users.
- If `VideoOverlay` (`components/VideoOverlay.ts`) has no users left, delete it too.
- If any deleted file is still imported, fix that import.

- [ ] **Step 3: Build and test**

Run: `npx nx build www && npx nx test www`
Expected: both succeed.

- [ ] **Step 4: Compare in the browser**

Run `npx nx serve www` in the background, then open `http://localhost:<port>/` in the browser pane. `preview_start` uses `.claude/launch.json`; add a `www` entry with `npm run`/`npx nx serve www` if one is missing.

Compare against `spec-visual.html` at desktop width and at the `mobile` preset (375px). Check:
- There's no horizontal scroll: `document.documentElement.scrollWidth <= innerWidth`.
- The React/Angular toggle updates the hero code, the steps, both install commands, the capability links and the Quick start links.
- The banner photo sits on the right and bottom edges at both widths.
- The copy buttons show a toast.

Reset the viewport with the `desktop` preset afterwards.

- [ ] **Step 5: Commit**

```bash
git add -A www/analog/src/app/pages/'(home).page.ts' www/analog/src/app/components
git commit -m "feat(www): rebuild the homepage around install and the threadplane banner"
```

---

### Task 13: Header

**Files:**
- Modify: `www/analog/src/app/components/Header.ts`

- [ ] **Step 1: Add a Quick start button and remove workshop comments**

In `Header.ts`:
1. Delete the commented-out workshops `<li>` block (lines 53-83, from `<!-- <li>` to `</li> -->`).
2. Delete the commented-out workshops link in the fullscreen menu (lines 168-174).
3. After the `<li><www-github-star-button /></li>` item, add:
   ```html
                 <li>
                   <a class="quick-start" [routerLink]="quickStartUrl()"
                     >Quick start</a
                   >
                 </li>
   ```
4. Add to the component class:
   ```ts
     quickStartUrl = computed(() => `/docs/${this.configService.sdk()}/start/quick`);
   ```
5. Add to the styles array (inside the existing template string):
   ```css
         .quick-start {
           display: inline-flex;
           padding: 8px 14px;
           border-radius: 10px;
           background: var(--chocolate-brown);
           color: #fff !important;
           font: 600 14px/1 'Fredoka', sans-serif;
           text-decoration: none;
         }
   ```

- [ ] **Step 2: Verify**

Run: `npx nx build www && npx nx lint www`
Expected:
- Both succeed.
- Grepping `Header.ts` for `workshop` finds nothing.

- [ ] **Step 3: Commit**

```bash
git add www/analog/src/app/components/Header.ts
git commit -m "feat(www): add Quick start to the header and drop workshop leftovers"
```

---

### Task 14: Footer

**Files:**
- Modify: `www/analog/src/app/components/Footer.ts`

- [ ] **Step 1: Rewrite the columns**

In `Footer.ts`:
1. Remove the `BrandBlueSky` import and its entry in `imports`.
2. Replace the `.learn` and `.contact` column `<div>`s with:
   ```html
           <div class="learn">
             <div class="title">Learn</div>
             <ul>
               <li><a routerLink="/blog" class="underline">Blog</a></li>
             </ul>
           </div>
           <div class="team">
             <div class="title">More from the team</div>
             <ul>
               <li>
                 <a href="https://threadplane.ai/?utm_source=hashbrown&utm_medium=footer" target="_blank" class="underline">
                   threadplane.ai <www-arrow-up-right height="12px" width="12px" />
                 </a>
               </li>
               <li>
                 <a href="https://b4.run" target="_blank" class="underline">
                   b4.run <www-arrow-up-right height="12px" width="12px" />
                 </a>
               </li>
               <li>
                 <a href="https://pretable.ai" target="_blank" class="underline">
                   pretable.ai <www-arrow-up-right height="12px" width="12px" />
                 </a>
               </li>
             </ul>
           </div>
   ```
3. In `.bottom`, delete the Bluesky `<li>`. Keep LinkedIn and GitHub.
4. Keep the brand block with `© LiveLoveApp, LLC {{ currentYear }}.` as plain text.
5. In the styles, rename any `.contact` selector to `.team`. If the grid places columns by name, update the grid template so four columns still line up.
6. Give `.title` the heading font: add `font-family: var(--font-heading);` to its rule.

- [ ] **Step 2: Verify**

Run:
```bash
npx nx build www
grep -n "bsky\|BlueSky\|contact-us\|mailto\|workshop" www/analog/src/app/components/Footer.ts
```
Expected: the build succeeds and the grep finds nothing.

- [ ] **Step 3: Commit**

```bash
git add www/analog/src/app/components/Footer.ts
git commit -m "feat(www): rework footer with team projects and no contact links"
```

---

### Task 15: Remove workshops

**Files:**
- Delete: `www/analog/src/app/pages/workshops.page.ts`, `www/analog/src/app/pages/workshops/`, `www/analog/src/content/workshops/`, `www/analog/src/app/models/workshop.models.ts`, `www/analog/src/app/components/CoursesMenu.ts`, `www/analog/src/app/components/Products.ts`, `www/analog/public/image/product/workshop/`
- Modify: `www/analog/src/app/pages/blog/[slug].page.ts` (remove the `.workshops` rule, around lines 314-316)
- Modify: `www/analog/src/content/blog/2025-09-05-hashbrown-v-0-3-0.md` (remove the `## Workshops` section, lines 274-279)

- [ ] **Step 1: Delete**

Run:
```bash
git rm -rq www/analog/src/app/pages/workshops.page.ts www/analog/src/app/pages/workshops www/analog/src/content/workshops www/analog/src/app/models/workshop.models.ts www/analog/src/app/components/CoursesMenu.ts www/analog/src/app/components/Products.ts www/analog/public/image/product/workshop
```
Then check whether `public/image/product/` is now empty and remove it if so. Also remove any component that only `CoursesMenu` or `Products` imported and nothing else uses; confirm with grep.

- [ ] **Step 2: Remove the dead CSS and the blog section**

- In `pages/blog/[slug].page.ts`, delete:
  ```css
          > .workshops {
            grid-template-columns: 1fr 1fr;
          }
  ```
- In `2025-09-05-hashbrown-v-0-3-0.md`, delete everything from the `## Workshops` heading through the paragraph after it, and one of the two `---` separators around it. Exactly one `---` should remain between the MCP section and `## Up Next`.

- [ ] **Step 3: Verify**

Run:
```bash
npx nx build www
grep -rni "workshop" www/analog/src www/analog/index.html
```
Expected:
- The build succeeds.
- The grep finds nothing. `public/llms*.txt` gets regenerated in Task 18.

- [ ] **Step 4: Commit**

```bash
git add -A www/analog
git commit -m "chore(www): remove workshops"
```

---

### Task 16: Remove LiveLoveApp CTAs, Bluesky, and lead generation

**Files:**
- Delete: `www/analog/src/app/components/LiveLoveAppButton.ts`, `www/analog/src/app/icons/BrandLiveLoveApp.ts`, `www/analog/src/app/icons/BrandLiveLoveAppWordmark.ts`, `www/analog/src/app/icons/BrandBlueSky.ts`
- Delete: `www/analog/src/app/pages/contact-us/`, `www/analog/src/app/services/FirebaseService.ts`
- Modify: `www/analog/package.json`, `package.json`, `package-lock.json` (remove `firebase`)
- Modify: `www/analog/src/app/pages/docs/react/start/platforms.md:51`, `www/analog/src/app/pages/docs/angular/start/platforms.md:51`
- Modify these blog posts:
  - `2025-06-25-hashbrown-launch.md`
  - `2025-07-16-hashbrown-v-0-2-0.md`
  - `2025-09-05-hashbrown-v-0-3-0.md`
  - `2025-10-22-ag-grid-ai-toolkit.md`
  - `2025-12-16-hashbrown-v-0-4-0.md`

- [ ] **Step 1: Delete the components, pages, and service**

Run:
```bash
git rm -rq www/analog/src/app/components/LiveLoveAppButton.ts www/analog/src/app/icons/BrandLiveLoveApp.ts www/analog/src/app/icons/BrandLiveLoveAppWordmark.ts www/analog/src/app/icons/BrandBlueSky.ts www/analog/src/app/pages/contact-us www/analog/src/app/services/FirebaseService.ts
grep -rn "LiveLoveAppButton\|BrandLiveLoveApp\|BrandBlueSky\|FirebaseService\|contact-us\|from 'firebase" www/analog/src
```
Expected: the grep finds nothing.

- [ ] **Step 2: Remove the firebase dependency**

`git grep -n firebase` must show only `package.json`, `www/analog/package.json` and `package-lock.json`, plus the spec and plan docs. If anything else imports firebase, stop and ask the user.

Otherwise run:
```bash
npm uninstall firebase --no-audit --no-fund
```
Then delete the `"firebase": ...` line from `www/analog/package.json` by hand.

Expected: `git diff --stat` shows `package.json`, `package-lock.json` and `www/analog/package.json`.

If npm reports ERESOLVE, re-run with `--legacy-peer-deps` only if the repo's `.npmrc` already sets it. Otherwise stop and report the error.

- [ ] **Step 3: Rewrite the platform docs line**

In both `platforms.md` files, replace line 51 with:
```md
Need a platform that is not listed here? [Open an issue on GitHub](https://github.com/liveloveapp/hashbrown/issues/new) and tell us what you are building. If your team wants a finished, headful agent UI with enterprise support, take a look at [threadplane](https://threadplane.ai/?utm_source=hashbrown&utm_medium=docs).
```

- [ ] **Step 4: Edit the blog posts**

These blog posts are Mike's. Keep his voice and change only the listed sentences:
- **`2025-06-25-hashbrown-launch.md`:** delete the `## How does LiveLoveApp support enterprises?` section (lines 227-233) and one of its two `---` separators.
- **`2025-10-22-ag-grid-ai-toolkit.md:155`:** delete the sentence starting "I'm also a Principal Architect at [LiveLoveApp]…" and the sentence "Drop me a line if you need help with your project at [mike@liveloveapp.com]…". Keep the introduction of Mike and Hashbrown.
- **`2025-07-16-hashbrown-v-0-2-0.md:286`:** replace ", or drop me a line at mike@liveloveapp.com and I'll personally get you onboarded" with " and join the conversation in [GitHub Discussions](https://github.com/liveloveapp/hashbrown/discussions)". Keep the sentence's punctuation intact.
- **`2025-09-05-hashbrown-v-0-3-0.md:266`:** replace "Drop me a line with feedback via email: mike@liveloveapp.com" with "Share feedback in [GitHub Discussions](https://github.com/liveloveapp/hashbrown/discussions)."
- **`2025-09-05-hashbrown-v-0-3-0.md:284`:** replace "send me an email at mike@liveloveapp.com and I'll personally get you onboarded into the project" with "start with an issue or a discussion on [GitHub](https://github.com/liveloveapp/hashbrown)".
- **`2025-12-16-hashbrown-v-0-4-0.md:137`:** replace "Shoot me an email at [mike@liveloveapp.com](mailto:mike@liveloveapp.com)" and the rest of that sentence with "Start with an issue or a discussion on [GitHub](https://github.com/liveloveapp/hashbrown)."

Before `https://github.com/liveloveapp/hashbrown/discussions` goes in, confirm GitHub Discussions is enabled:

```bash
gh api repos/liveloveapp/hashbrown --jq .has_discussions
```

If it prints `false`, use `https://github.com/liveloveapp/hashbrown/issues` instead.

- [ ] **Step 5: Verify**

Run:
```bash
npx nx build www
grep -rniE "liveloveapp\.(com|dev)|bsky|hello@|mike@|contact-us|firebase" www/analog/src www/analog/index.html
```
Expected:
- The build succeeds.
- The grep finds nothing.
- `github.com/liveloveapp/...` URLs and the footer copyright are allowed; the pattern above doesn't match them.

- [ ] **Step 6: Commit**

```bash
git add -A www/analog package.json package-lock.json
git commit -m "chore(www): remove LiveLoveApp CTAs, Bluesky, and lead generation"
```

---

### Task 17: Remove the announcement toast

**Files:**
- Delete: `www/analog/src/app/components/Announcement.ts`
- Modify: `www/analog/src/app/app.component.ts`, lines 12, 37 and 40

- [ ] **Step 1: Remove it**

- Delete `import { Announcement } from './components/Announcement';`.
- Remove `Announcement` from `imports`.
- Delete the `<www-announcement />` line.
- Run `git rm -q www/analog/src/app/components/Announcement.ts`.

- [ ] **Step 2: Verify**

Run: `npx nx build www && grep -rn "Announcement" www/analog/src/app`
Expected: the build succeeds and the grep finds nothing.

The `localStorage` key the toast used is harmless to leave in browsers.

- [ ] **Step 3: Commit**

```bash
git add -A www/analog/src/app
git commit -m "chore(www): remove the v0.5 announcement toast"
```

---

### Task 18: Regenerate llms files

**Files:**
- Modify: `www/analog/public/llms.txt`, `www/analog/public/llms-full.txt`

- [ ] **Step 1: Regenerate**

Run: `npx nx generate-llms www`
Expected: success.

Then run: `grep -niE "workshop|liveloveapp\.com|mike@|hello@" www/analog/public/llms.txt www/analog/public/llms-full.txt`
Expected: nothing.

- [ ] **Step 2: Commit**

```bash
git add www/analog/public/llms.txt www/analog/public/llms-full.txt
git commit -m "docs(www): regenerate llms files"
```

---

### Task 19: Full verification

**Files:** none, unless verification finds problems.

- [ ] **Step 1: Run everything**

Run:
```bash
npx nx build www && npx nx test www && npx nx lint www && npx nx e2e www
```
Expected:
- All succeed.
- Lint shows no more warnings than the Task 0 baseline.
- If an e2e test asserted on removed routes or on the old hero, update the assertion to the new behavior and note it in the PR.

- [ ] **Step 2: Sweep for leftovers**

Run:
```bash
grep -rniE "workshop|bsky|bluesky|liveloveapp\.(com|dev)|contact-us|firebase|hashy-skates|Announcement" www/analog/src www/analog/index.html www/analog/public/llms.txt
```
Expected: nothing.

- [ ] **Step 3: Check in the browser**

Serve the site with `npx nx serve www` and check it in the browser pane.

At desktop width and at the `mobile` preset (375px):
1. No horizontal scroll.
2. The framework toggle updates every section and persists on reload.
3. The copy buttons copy and show a toast.
4. The banner photo is anchored to the right and bottom edges.
5. `/contact-us` and `/workshops` return the 404 page.
6. The footer shows four columns: Docs, Learn, More from the team, and Community. Community has GitHub and LinkedIn only.
7. There are no console errors.

Take screenshots of the desktop hero, the mobile hero and the banner for the PR. Reset the viewport with the `desktop` preset.

- [ ] **Step 4: Report**

Summarize the results of the build, test, lint and e2e runs, including any warnings. List any e2e assertions you changed.
