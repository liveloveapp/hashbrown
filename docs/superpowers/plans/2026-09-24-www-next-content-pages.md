# www-next Phase 3: Content Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the rest of the page content to `www-next`: the API reference (index and full symbol pages), the blog and samples pages, and the homepage. After this phase, every route of hashbrown.dev renders in Next.js with the live site's look and behavior, except search.

**Architecture:** Same as Phase 2 (`docs/superpowers/plans/2026-09-24-www-next-docs-parity.md`). Angular components become React components in `www/next/src/components/<area>/` with CSS Modules. Components are Server Components by default, with small `'use client'` leaves for state and browser APIs. Data is read at build time with `fs` (see `www/next/src/lib/content.ts` and `api-reference.ts`). Pages are statically generated.

**Source of truth:** the Angular files named in each task, under `www/analog/src/app`. Match markup, CSS values, breakpoints, text and behavior. The squircle directive becomes `border-radius`.

**Conventions:** AGENTS.md (top-level `test()`, arrange/act/assert, TSDoc on exports, no new dependencies, fix lint). Phase 2 lessons: with Next's CSS minifier, don't combine `font-variation-settings` with the `font` shorthand in one rule; use longhands. Read `localStorage` without hydration mismatches (see `www/next/src/components/use-site-config.ts`).

## Work split

The three tasks touch disjoint files and run in parallel. Each owns `www/next/src/components/<area>/**`, `www/next/test/<area>/**` and the app routes listed. None of them edits `docs-components.tsx`, `layout.tsx` files outside its routes, `project.json`, `tsconfig.json` or `vitest.config.mts`. If a task needs one of those changed, it reports the exact change instead.

### Task A: API reference

**Port:** `pages/api/index.page.ts` (search, kind filter, symbol chips), `pages/api/[package]/[symbol].page.ts`, and every `components/Symbol*.ts` (Symbol, SymbolApi, SymbolHeader, SymbolSummary, SymbolExcerpt, SymbolExcerptGroup, SymbolParams, SymbolReturn(s), SymbolTypeParams, SymbolMethods, SymbolUsageNotes, SymbolExamples, SymbolChip, SymbolCodeLink, SymbolPopover, SymbolLink), `KindChip.ts`, `DeprecatedChip.ts`, and the parts of `services/ApiService.ts` they use (including namespace members such as `s.string`).

**Owns:** `www/next/src/components/api/**`, `www/next/test/api/**`, `www/next/src/app/api/page.tsx`, `www/next/src/app/api/[pkg]/[symbol]/page.tsx` (replace the spike's minimal page), and `www/next/src/lib/api-reference.ts` (extend it; keep the existing exports working).

- [ ] Tests first. The index lists every symbol from `api-report.min.json`, and the kind filter and search narrow it. A symbol page renders its header, signature with reference links (excerpt tokens that are `Reference` link to `/api/<pkg>/<name>`; private `~` ones don't), params, returns, type params, methods, usage notes and examples. Deprecated symbols show the chip.
- [ ] If the Angular routes serve namespace members (`/api/core/s.string` or similar), keep those URLs working with `generateStaticParams`.
- [ ] Symbol popovers (hover a symbol link for a summary) go in a client leaf; data comes from props rendered on the server, not a runtime fetch.
- [ ] Keep `renderMarkdown` from `www/next/src/lib/markdown.tsx` for doc comments; it returns `{ content, headings }`.

### Task B: Blog and samples

**Port:** `pages/blog/index.page.ts` (filters and post list), `pages/blog/[slug].page.ts` (post layout, byline, YouTube embed, hero image), `components/PostPreview.ts`, `components/Youtube.ts`, `pages/samples.page.ts`, `pages/samples/index.page.ts`, and the retired `pages/samples/{finance,fast-food,smart-home}.page.ts`.

**Owns:** `www/next/src/components/blog/**`, `www/next/src/components/samples/**`, `www/next/test/blog/**`, `www/next/test/samples/**`, `www/next/src/app/blog/page.tsx`, `www/next/src/app/blog/[slug]/page.tsx` (keep `generateStaticParams`, `dynamicParams = false` and `generateMetadata` via `pageMetadata`), and `www/next/src/app/samples/**`. Post attributes can be extended in `www/next/src/lib/content.ts`, adding fields only. Frontmatter includes `team`, `youtube` and `ogImage`; check `models/blog.models.ts`.

- [ ] Tests first. The index renders every post, newest first, with filters behaving as in Angular. A post page renders the title, date, team byline, YouTube embed when set, and body. The samples index links match Angular's, and the retired pages render their messages.
- [ ] Blog URLs stay file-name based (see `listBlogPosts`).

### Task C: Homepage

**Port:** `pages/(home).page.ts` and everything under `components/home/` (HomeHero, HowItWorks, Capabilities, RealApp, WorksWith, LatestPosts, ClosingCta, ThreadplaneBanner, InstallCommand, providers/*, `home.content.ts`, `copy-text.ts`, `latest-posts.ts`), plus the build-time code highlighting that `src/tools/home-code-plugin.ts` and `highlight-code.ts` provide as a Vite virtual module.

**Owns:** `www/next/src/components/home/**`, `www/next/test/home/**`, `www/next/src/app/page.tsx` (replace the spike index), and `www/next/src/lib/home-code.ts`.

- [ ] Tests first. Port the existing Angular specs (`home.content.spec.ts`, `copy-text.spec.ts`, `latest-posts.spec.ts`, `home-code.spec.ts`) as behavior tests. Hero and step code is highlighted at build time: call the Shiki highlighter from `www/next/src/lib/rehype-shiki.ts`, exporting a helper there only if needed, in a Server Component. There's no virtual module. The React/Angular toggle switches the code samples client-side, as it does on the live site.
- [ ] The homepage uses the site header and footer from `www/next/src/components/site/`; import them, don't copy them.
- [ ] Metadata comes from the `(home).page.ts` `routeMeta` through `pageMetadata`.

### Task D: Integration and verification (coordinator)

- [ ] Review each task's diff and make any shared-file changes they report.
- [ ] `npx nx run-many -t test lint build -p www-next` and `npx nx run www-next:spike-report` pass. Extend the report's route parity to `/`, `/api`, `/samples` and `/samples/*`.
- [ ] Compare each new page with hashbrown.dev at 1440px and 375px: no console errors, no hydration warnings.
- [ ] Record the results in `www/next/SPIKE.md` under "Phase 3", then open a PR stacked on the Phase 2 PR (or on `main` if the stack has merged).
