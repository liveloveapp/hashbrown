# www-next Phase 2: Docs Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/docs/**`, `/api/**` and `/blog/**` on `www-next` look and behave like hashbrown.dev: shared header and footer, docs and API menus, markdown typography with an on-page table of contents, and every custom element the markdown uses.

**Architecture:** Builds on the spike (`www/next`, PR #584). Every Angular component is ported to a React component in `www/next/src/components/<area>/`, with a CSS Module for its styles. Components are Server Components unless they need state, effects or browser APIs; those parts become small `'use client'` leaves. Heading ids and the table of contents are computed at build time by a rehype plugin that uses the Angular slug rule exactly, so existing `#fragment` links keep working. Site preferences (SDK, provider, backend) that Angular kept in `ConfigService` move to a small client store backed by `localStorage`, using the same key and shape.

**Tech stack:** Next.js 16 App Router, React 19.2, CSS Modules, unified/rehype (already added), Vitest 4 + `react-dom/server` for markup tests.

**Source of truth:** the Angular components under `www/analog/src/app`. A port matches its markup structure, CSS values, breakpoints and behavior unless a step says otherwise.

**Conventions (from AGENTS.md):** top-level `test()` only, arrange/act/assert separated by blank lines, TSDoc on exported functions and components, no new dependencies, fix lint rather than suppress it.

---

## File structure

```
www/next/public -> ../analog/public          symlink until cutover
www/next/src/
  app/
    layout.tsx                               + default OG/Twitter meta, favicons, theme-color
    docs/[sdk]/layout.tsx                    header + docs menu + article shell
    docs/[sdk]/[...slug]/page.tsx            renders into MarkdownPage
    api/layout.tsx                           header + API menu + article shell
    blog/layout.tsx                          header + footer
  lib/
    rehype-heading-ids.ts                    Angular slug rule, collects headings for the TOC
    site-config.ts                           AppConfig type, normalize, storage key (pure)
  components/
    markdown/MarkdownPage.tsx (+ .module.css)   article typography + TOC
    markdown/TableOfContents.tsx             client: active heading + fade near the bottom
    site/Header.tsx … (+ css)                port of Header.ts and its children
    site/Footer.tsx (+ css)                  port of Footer.ts
    menus/DocsMenu.tsx (+ css)               port of DocsMenu.ts (+ DropDownMenu)
    menus/ApiMenu.tsx (+ css)                port of ApiMenu.ts
    elements/BackendCodeExample.tsx (+ css)  port of BackendCodeExample.ts
    elements/Carousel.tsx (+ css)            port of Carousel.ts
    elements/MagicTextDemo.tsx (+ css)       port of MagicTextDemo.ts, on @hashbrownai/react
    icons.tsx                                + DatabaseCog, Message, Bolt, Angular, React, …
    use-site-config.ts                       client hook over site-config + localStorage
```

## Work split

Tasks 1–3 touch disjoint files and can run in parallel. Task 4 integrates them and belongs to the coordinator. Task 5 verifies.

---

### Task 1: Site chrome (header and footer)

**Port:** `www/analog/src/app/components/Header.ts`, `Footer.ts`, and every component, icon and service they use (`GitHubStarButton.ts`, `FullscreenMenu.ts`, `Squircle.ts`, `DropDownMenu.ts` if used, `ConfigService` usage).

**Create:** `www/next/src/components/site/*`, extra icons in `www/next/src/components/site/icons.tsx`, and tests in `www/next/test/site/*.spec.tsx`.

- [ ] Read the Angular sources end to end first. List each piece of behavior (links, mobile menu, GitHub stars, search trigger, SDK-dependent links) as a test.
- [ ] Write failing markup tests with `renderToStaticMarkup`. At minimum: header links match the Angular hrefs, the docs link uses the `sdk` prop, the footer renders its link columns and copyright, and the mobile menu button has an accessible name.
- [ ] Implement. Replace squircles with `border-radius`. The search button dispatches `new CustomEvent('hashbrown:search-overlay:open')` on `window` (the value of `SEARCH_OVERLAY_OPEN_EVENT` in `SearchOverlay.ts`). Search itself is a later phase. For the GitHub star count, keep what Angular does: if it fetches at runtime, fetch in a client leaf; if it's static, keep it static.
- [ ] `npx nx test www-next` and `npx nx lint www-next` pass.

**Interface for Task 4:** `export function Header(props: { sdk?: 'react' | 'angular' })` and `export function Footer()`, importable from `www/next/src/components/site/Header` and `.../Footer`.

### Task 2: Docs and API menus

**Port:** `www/analog/src/app/components/DocsMenu.ts`, `ApiMenu.ts`, `DropDownMenu.ts`, `NavigationList.ts` (if used), and the menu models in `www/analog/src/app/models/menu.models.ts`.

**Create:** `www/next/src/components/menus/*` and `www/next/test/menus/*.spec.tsx`.

- [ ] Read the sources. The docs menu links are in the template: port them as data (an array of sections and links per SDK) in `www/next/src/components/menus/docs-menu.data.ts`, so a test can check them.
- [ ] Failing tests:
  - Every docs-menu link for both SDKs resolves to an existing docs page. Use `listDocs` from `www/next/src/lib/content.ts`, and allow only the external or non-docs links the Angular menu has.
  - The SDK switcher links to the same page in the other SDK, falling back to that SDK's intro when no counterpart exists.
  - The API menu lists every symbol in `api-report.min.json`, grouped by package, with `/api/<pkg>/<symbol>` hrefs.
- [ ] Implement. The active link comes from `usePathname()` in a small client leaf; the rest stays server-rendered. The dropdown can be a native `<details>` or a small client component, but it must close on outside click and on Escape.
- [ ] Tests and lint pass.

**Interface for Task 4:** `export function DocsMenu(props: { sdk: 'react' | 'angular' })` and `export function ApiMenu()`.

### Task 3: Remaining markdown elements

**Port:** `BackendCodeExample.ts`, `Carousel.ts`, `MagicTextDemo.ts` from `www/analog/src/app/components/`, the icons `DatabaseCog.ts`, `Message.ts`, `Bolt.ts` from `www/analog/src/app/icons/`, and the parts of `ConfigService.ts` they need (backend and provider preference).

**Create:** `www/next/src/components/elements/*`, `www/next/src/lib/site-config.ts`, `www/next/src/components/use-site-config.ts`, and `www/next/test/elements/*.spec.tsx`. Add the three icons to `www/next/src/components/icons.tsx`; that file is shared, so append only.

- [ ] Read how each element is used in markdown (`grep -rn "<hb-backend-code-example\|<hb-carousel\|<hb-magic-text-demo" www/analog/src`), including its attributes and children.
- [ ] `site-config.ts`: pure `normalizeAppConfig` (port it verbatim), the `AppConfig` type, the default config and the `localStorage` key Angular uses. Test `normalizeAppConfig` with the same cases as the Angular spec if one exists.
- [ ] `BackendCodeExample`: find out how Angular picks the code per backend (children with an attribute, or files). Port the tab switcher with the selection persisted through `use-site-config`. SSR must render the default backend's code, so the page works without JavaScript.
- [ ] `MagicTextDemo`: port onto `@hashbrownai/react`, calling the site's `/_/chat` endpoint. Match the Angular demo's prompt, schema and UI. If a needed React API doesn't exist, stop and report it rather than inventing one.
- [ ] `Carousel`: port with keyboard support equal to the Angular one.
- [ ] Failing tests first (markup for each, `normalizeAppConfig` cases), then implement. Tests and lint pass.

**Interface for Task 4:** named exports `BackendCodeExample`, `Carousel` and `MagicTextDemo` (props = the element's attributes as strings, plus `children`), and `DatabaseCogIcon`, `MessageIcon` and `BoltIcon` in `icons.tsx`.

### Task 4: Layouts, typography, table of contents, wiring (coordinator)

**Files:** `www/next/src/lib/rehype-heading-ids.ts`, `www/next/src/components/markdown/*`, `www/next/src/app/**/layout.tsx`, `www/next/src/app/layout.tsx`, `www/next/src/lib/markdown.tsx`, `www/next/src/components/docs-components.tsx`, `www/next/project.json`, and tests in `www/next/test/heading-ids.spec.ts` and `www/next/test/markdown.spec.tsx`.

- [ ] **Heading ids.** Failing tests for `slugifyHeading`, ported from `MarkdownPage.collectHeadings`: lowercase, spaces → `-`, `:` and `@` removed, `/` → `-`, periods kept, so `Hashbrown v0.6` → `hashbrown-v0.6`. The rehype plugin sets `id` on `h1`–`h3` and returns the heading list `{ level, text, id }`. `renderMarkdown` returns `{ content, headings }`. Update its callers and tests.
- [ ] **MarkdownPage.** Port the article typography from `MarkdownPage.ts`: every rule under `analog-markdown-route > div`, re-targeted at the article element. Custom-element selectors (`hb-code-example`, `hb-next-step a`, `hb-symbol-link`) move to the React components' own classes or `data-component` attributes. The TOC is server-rendered from `headings`. `TableOfContents` is a client leaf that highlights the active heading (IntersectionObserver, threshold 1) and fades out near the bottom, as in Angular.
- [ ] **Layouts.** `docs/[sdk]/layout.tsx` ports `pages/docs.page.ts`: header, docs menu, a white article panel on the fabric texture, and the 768px and 1024px breakpoints. The `/api` and `/blog` layouts follow `pages/api.page.ts` and `pages/blog.page.ts`.
- [ ] **Root layout.** Port the head of `www/analog/index.html` into Next `metadata`: Open Graph, Twitter, favicons, `apple-touch-icon`, theme-color, and per-section defaults from each `routeMeta`. Symlink `www/next/public -> ../analog/public`.
- [ ] **Element map.** Register the Task 3 elements and icons in `docsComponents`. The markdown test for the quick start keeps passing, and the spike report shows no MISSING elements.
- [ ] **Wiring.** `www-next:build` and `serve` get `dependsOn` on `www:collect-docs` and `www:generate-llms` as well as `openai:build`, so generated inputs are never stale.
- [ ] Tests, lint and build pass. Commit.

### Task 5: Verify

- [ ] `npx nx run-many -t test lint build -p www-next`, then `npx nx run www-next:spike-report`: no MISSING elements, full route parity.
- [ ] Browser, desktop (1280px) and mobile (375px): `/docs/react/start/quick`, `/docs/angular/concept/components`, `/api/react/useChat` and the latest blog post. Compare each side by side with the Analog dev server on the same path. Check the header and menus, the SDK switcher, TOC highlighting, a backend code example tab switch persisted across reloads, and the magic-text demo streaming (with `OPENAI_API_KEY` in `www/next/.env.local`, which is gitignored). No console errors and no hydration warnings.
- [ ] Record differences you choose to keep in `www/next/SPIKE.md` under "Phase 2".
- [ ] Open a PR stacked on #584, or on `main` if #584 has merged.
