# hashbrown.dev on Next.js: spike findings

Plan: [`docs/superpowers/plans/2026-09-24-www-next-spike.md`](../../docs/superpowers/plans/2026-09-24-www-next-spike.md).
Branch: `blove/www-next-spike`.

## What the spike covers

A Next.js 16 App Router project, `www-next`, that renders the real content of
`www/analog` without changing it:

| Route | Source | Result |
| --- | --- | --- |
| `/docs/[sdk]/[...slug]` | docs markdown in `www/analog/src/app/pages/docs` | 77/77 pages prerendered (checked against `llms.txt`) |
| `/api/[pkg]/[symbol]` | api-extractor JSON in `www/analog/src/app/reference` | 191/191 prerendered (checked against `api-report.min.json`); summary, signature and examples only |
| `/blog`, `/blog/[slug]` | `www/analog/src/content/blog` | 11/11 |
| `/_/chat` | port of `src/server/routes/_/chat.post.ts` | streams real AG-UI events from OpenAI (verified with a live key) |

```sh
npx nx build www-next                 # 283 static pages
npx nx serve www-next --port=4200     # dev server
npx nx test www-next                  # 29 tests
npx nx lint www-next
npx nx run www-next:spike-report      # element coverage + route parity (after a build)
```

## Results

- **The markdown carries over unchanged.** unified (remark → rehype-raw →
  `hast-util-to-jsx-runtime`) parses every docs page and blog post. `<hb-*>`
  tags become React components. Tags inside code samples stay text, and
  canonical references (`@hashbrownai/react!useChat:function`) become API links.
  Nothing needed MDX.
- **Element coverage:** of the 14 custom element types written in the
  markdown, 8 are ported, covering 453 of 491 uses. `hb-symbol-link`, which the
  pipeline generates from canonical references, is also ported. Not yet ported (they render as dashed placeholders
  with their content kept):

  | Element | Uses | Angular source |
  | --- | --- | --- |
  | `hb-database-cog`, `hb-message`, `hb-bolt` | 22 | icons, ~45 lines each |
  | `hb-backend-code-example` | 12 | `BackendCodeExample.ts`, 228 lines (tabbed code) |
  | `hb-carousel` | 2 | `Carousel.ts`, 242 lines |
  | `hb-magic-text-demo` | 2 | `MagicTextDemo.ts`, 158 lines (live `@hashbrownai/angular` demo) |

- **Builds:** `next build` takes 8.6s cold and prerenders all 283 pages in about
  2.4s. The Analog build spends about 12s in its three Vite passes (client 6.0s,
  SSR 4.6s, Nitro 1.7s) and renders pages per request at runtime.
- **Dev server:** ready in 249ms; the first page compiles in about 1s. It needs
  no dev-only workaround plugins (compare `angularLinkerDepsPlugin` and
  `ssrDepsReadyPlugin`, analogjs/analog#2577 and #2578).
- **Browser check:** no hydration warnings. The expander toggles, next steps
  resolve under `/docs/<sdk>/…`, and symbol links go to `/api/<pkg>/<name>`.
  The copy button reaches the clipboard API; the embedded browser denies write
  permission, so the copy itself wasn't confirmed.

## Findings a migration has to handle

1. **Provider packages don't bundle from source under Turbopack.** Every
   provider package (`openai`, `anthropic`, `azure`, `bedrock`, `google`,
   `ollama`) declares `"type": "commonjs"` but its source is ESM. Vite/Nitro
   tolerated this when aliased to source; Turbopack refuses. The spike uses the
   built `dist/packages/openai` (tsconfig path plus `dependsOn: openai:build`), the
   way an npm consumer would. A change to the provider source now needs a
   rebuild before the site sees it.
2. **Generated inputs aren't wired up.** The site reads `collect-docs` output
   (reference JSON) and `generate-llms` output (`llms.txt`). Both are gitignored,
   and stale copies silently produced wrong results during the spike: 189 vs
   191 symbols, and old migration-guide URLs. `www-next:build` needs `dependsOn`
   on those targets, and a real migration should move content and reference
   generation to a neutral location such as `www/content`.
3. **Nx module boundaries block importing from `www/analog`.** The Shiki theme
   was copied into `src/lib/shiki-hashbrown.ts`. Shared assets have to move,
   not be imported across projects.
4. **Blog URLs use the file name, not the frontmatter `slug`.** Analog's
   `contentFile.slug` comes from the file name. Two posts' frontmatter slugs
   differ in case (`2025-06-25-Hashbrown-launch`). The spike matches Analog.
5. **`/_/chat` needs the `%5F` folder escape**, because App Router treats `_folders`
   as private. It works: `/_/chat` serves the route and `/%5F/chat` returns 404.
   `maxDuration = 300` moves from the Nitro Vercel preset into the route.
6. **Environment loading differs.** Next loads `.env*` only from `www/next`. The
   Analog handler used `dotenv/config` from the working directory (the repo root).
7. **tsconfig `paths` need a project-local `baseUrl`.** Turbopack didn't resolve
   paths against the `baseUrl` inherited from `tsconfig.base.json`.
8. **`next dev` writes `AGENTS.md`/`CLAUDE.md` into the project** unless
   `agentRules: false` is set. The repo has its own `AGENTS.md`, so the spike
   turns it off.
9. **Small ones:** Vitest needs `oxc.jsx.runtime: 'automatic'` because the
   tsconfig uses `jsx: preserve` for Next. The hashbrown Shiki theme has a
   transparent background, so bare code blocks need a dark surface. `next build`
   type-checks more strictly than the Analog build (the theme cast had to change).

## Not covered by the spike

Visual parity: only `styles.css` and three component styles were ported, so
headings and lists are unstyled. Also not covered: the markdown typography in
`MarkdownPage.ts`, header, footer, docs and API menus, search, the homepage,
samples pages, API symbol pages beyond summary/signature/examples (params,
methods, popovers, links inside signatures), Open Graph and Twitter meta from
`index.html`, and a Vercel preview deploy.

## Remaining work, sized from the Angular source

| Area | Angular lines | Notes |
| --- | --- | --- |
| Site chrome: `Header`, `Footer`, `DocsMenu`, `ApiMenu` | ~1,500 | mostly markup and CSS |
| Markdown typography (`MarkdownPage.ts`) | ~440 | becomes CSS |
| API symbol components (`Symbol*.ts`, 17 files) | ~1,500 | reference links in signatures, popovers |
| Search (`SearchOverlay.ts`) | ~940 | AI search on `@hashbrownai/angular` → `@hashbrownai/react`; needs a build-time docs index instead of `import.meta.glob` |
| Homepage (`components/home`, including providers) | ~1,850 | needs `highlight-code.ts` output as data, not a Vite virtual module |
| Remaining markdown elements | ~750 | table above |
| Wiring | small | `dependsOn` for generated inputs, OG meta, redirects, Vercel project switch, e2e rewrite |

Not needed: `components/ldp/*` (~1,000 lines) is unused, and `LocalModelsDemo`
is registered but no markdown uses it.

**Revised estimate: 1.5–3 weeks for one engineer**, down from 2–4. The spike
retired the risky parts: the markdown pipeline, static generation of every
existing URL, the reference-data pipeline and the streaming chat route. What's
left is mostly translating components and styling them, which is predictable
work.
