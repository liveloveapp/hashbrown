# Homepage follow-ups: dev server, Shiki, invoicing stills

Date: 2026-09-23
Status: approved in brainstorming
Builds on: `2026-09-23-homepage-redesign-design.md`

There are three independent fixes, all on branch `blove/homepage-redesign`.

## A. Fix the `www` dev server

`npx nx serve www` fails on `main` as well. There are two causes.

1. **Babel version.** `@analogjs/platform@3.0.0-alpha.64` imports the top-level `@babel/core@7`. Its Angular-linker plugin uses that copy for dev SSR dependency optimization, but `@angular/compiler-cli@22` needs Babel 8. Upstream fixed this in `3.0.0-alpha.86`. From that version on, the linker loads Babel from compiler-cli and Analog also pre-bundles `@angular/common/http` and `@angular/core/rxjs-interop` for SSR.
2. **rxjs.** Our `vite.config.ts` puts rxjs in SSR `noExternal`. Because rxjs is not pre-bundled in dev, its CommonJS build fails with `exports is not defined`.

**Decision.** Make these changes:
- Upgrade `@analogjs/content`, `router`, `platform`, `vite-plugin-angular` and `vitest-angular` to exactly `3.0.0-alpha.87`.
- Remove the `index:` option from `vite.config.ts`. alpha.87 wires the client `index.html` into SSR itself, and keeping the option breaks the build with `UNRESOLVED_ENTRY`.
- Add `optimizeDeps: { include: ['rxjs', 'rxjs/operators'] }` under `environments.ssr`.

A trial upgrade in a scratch copy already passed:
- `/` and `/docs` returned server-rendered pages
- the `www` build, tests and e2e
- `nx test angular`, which also uses `@analogjs/vite-plugin-angular`

## B. Shiki highlighting for the homepage code

`HighlighterService` has been a plain-text stub since #450, when Cloudflare's runtime couldn't load Shiki's WASM. The docs are still highlighted at build time, because Analog's content plugin runs Shiki with the `hashbrown` theme and emits inline token colors.

**Decision.** Highlight the homepage samples at build time, the same way the docs are highlighted:
- A Vite plugin serves a virtual module, `virtual:home-code-html`.
  - It loads `home.content.ts` with `runnerImport`.
  - It highlights every sample with full `shiki` and the `hashbrown` theme.
  - It exports the resulting HTML as string constants.
- The browser does no Shiki work. It adds about 0.9 kB gzip, has no async init, and avoids flashes and hydration mismatches.
- The homepage code panels become the docs' dark panel: `var(--gray-dark)` with the hashbrown theme. The user chose this over a light theme.
- `HomeHero` and `HowItWorks` render the precomputed HTML through `DomSanitizer.bypassSecurityTrustHtml`. This is required so the style attributes survive, and it is safe because the HTML is a build-time constant.
- `.code ::ng-deep code { font: inherit; }` overrides the global `code` font.
- The `html` language covers the Angular template snippet.

**Out of scope.** API reference highlighting (`SymbolExcerpt`, `pipes/Markdown.ts`). Record it as a follow-up.

## C. A reproducible invoicing screenshot

The user wants the homepage "See it in a real app" image to show a generative UI answer, captured the way threadplane captures its stills:

1. Record a real run once.
2. Commit the recording.
3. Replay it deterministically.
4. Screenshot the replay.

### Tape

- The recording is an AG-UI event tape of one real answer from the invoicing assistant, stored at `examples/invoicing/e2e/recordings/overdue-60.agui.json`.
- Format: `{ version: 1, recordedAt, question, events: [{ event }] }`.
- The question is: "Which USD customers are more than 60 days overdue?" Pinning the currency avoids multi-currency answers.
- A recorder Playwright script (`record-answer`) runs against the live app and model and needs `OPENAI_API_KEY`. It captures the `/agui/` SSE response with `page.route`.
- The recorder validates the take before writing it:
  - It contains a successful `render` tool call followed by `RUN_FINISHED`.
  - It contains no `RAW`, `CUSTOM` or reasoning events.
  - It contains no `sk-` string and no `Authorization` string.
- It then writes the tape. The rule: never hand-edit what the model said. If a take is bad, record it again.

### Replay

- The deterministic fixture server (`examples/invoicing/server/browser-fixture.ts`) gains an assistant-agent replay mode that streams the tape.
- The replay rewrites `threadId`/`runId` to match the incoming request and drops `MESSAGES_SNAPSHOT`.
- The pure tape functions (validate, sanitize, rewrite) live in `examples/invoicing/server/src/fixture-tape.ts` and have Vitest tests.

### Stills

- A stills Playwright script (`stills`) replays the tape against the fixture server with no API key.
- It waits for the validated answer: `.assistant-answer` is visible, the status line is gone, and the expected components are present.
- It captures two images:
  - desktop, 1400×875 at device scale 2, shipped 1400 wide
  - mobile, 390×~700, the conversation region
- It converts both to WebP with `sharp` (a new root devDependency, approved by the user), capped at 150 KB each, and writes:
  - `www/analog/public/image/landing-page/invoicing.webp`
  - `www/analog/public/image/landing-page/invoicing-mobile.webp`
- It captures with `channel: 'chrome'` on macOS for consistent fonts.
- Stills are regenerated by hand and committed. CI does not rewrite them.

### Targets and guard

- New Nx targets on `invoicing-e2e`: `record-answer` (live, `cache: false`) and `stills` (deterministic, `cache: false`).
- A new test in `workflow.spec.ts` replays the tape and asserts the answer renders validated, with real rows. It runs in the existing deterministic e2e, so a stale tape fails CI.

### Homepage use

- `RealApp.ts` uses a `<picture>`: `invoicing-mobile.webp` below 768px, and `invoicing.webp` otherwise.
- Delete `invoicing.jpg`.

## Testing

- A: `www` build, test, lint and e2e; `nx test angular`; the dev server returns 200 with server-rendered HTML for `/` and `/docs`.
- B: Vitest for `highlight-code.ts` and for the virtual module; a browser check that the hero and steps show colored tokens and switch framework.
- C: Vitest for `fixture-tape.ts`; the deterministic e2e including the new guard; a visual check of both stills.
