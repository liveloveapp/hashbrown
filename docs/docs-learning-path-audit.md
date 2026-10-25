# Angular and React learning-path audit

Audited on October 25, 2026, alongside the local JSON parser and light chatbot examples.

The path starts with a working welcome card, explains messages and application ownership, then builds toward schemas, typed data, trusted components, tools and production concerns. Both SDKs share the menu in `www/src/components/menus/docs-menu.data.ts`. Migrations remains the last group and starts collapsed. This audit keeps existing routes and navigation.

## Findings and changes

| Finding                                                                                                                                               | Change                                                                                                                                                                                  | Source evidence                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Angular v0.6 migration prompt sent React readers to the Angular guide.                                                                            | Corrected the React URL in `www/content/docs/angular/migrations/v0-6.md`.                                                                                                               | The two framework guides have separate routes.                                                                                                                                                                   |
| Shopping-list prose implied that an ordinary object waits for its closing brace.                                                                      | Describe required field values resolving together, distinguish the visible preview from a completed response, and update the shared schema's TSDoc and both exact source disclosures.   | `ObjectType.fromJsonAstImpl` in `packages/core/src/schema/base.ts` resolves the shape's children without requiring the object's node status to be complete. The local parser example demonstrates this boundary. |
| Streaming appears in Fundamentals before the schema and structured-output guides it uses.                                                             | Keep the existing shopping-list walkthrough and its prerequisites; offer the local JSON Parser recipe as an endpoint-free way to explore streaming.                                     | `www/src/components/menus/docs-menu.data.ts`, both `concept/streaming.md` pages, and `www/examples/quickstart/runtime/json-parser-demo.ts`.                                                                      |
| Tool calling began with API fragments that depend on application functions and services, without a setup prerequisite or a complete runnable example. | Add Quickstart and schema prerequisites, identify the fragments, and link the checked chatbot recipe.                                                                                   | Both `concept/functions.md` pages use app-owned `fetchUser`, light stores or update functions. The checked light clients include a real read tool, component registration and conversation UI.                   |
| The tool examples change lights directly, while the new chatbot asks the user to Apply. The distinction was unexplained.                              | Explain when a tool handler runs, where application rules belong, and when to use a read-only tool with a separate Apply action. Link server writes to endpoint authorization guidance. | `useTool` / `createTool` handlers execute through the runtime. `www/examples/quickstart/runtime/light-chatbot.ts` checks turn, revision, completion and proposal values at Apply.                                |
| Exposing components followed the Quickstart but introduced a Markdown component without its implementation or setup context.                          | Add prerequisites, describe the component contract, and link complete chatbot and Magic Text examples. Preserve the API comparisons and snippets.                                       | Both `concept/components.md` pages; checked examples under `www/examples/quickstart`.                                                                                                                            |

## What stays shared

Structured output, Streaming and Natural language forms deliberately use the same shopping-list component. Structured output owns the complete checked implementation; the other pages explain progressive display and form review. Keep those links instead of copying another component into each guide.

The introduction, Quickstart and request walkthrough reuse the welcome-card recording to explain different parts of the same task. Message history links to browser storage and server-managed Threads rather than implying that a thread ID restores saved messages. These are useful connections, so this audit leaves them intact.

Installed Threadplane walkthroughs name the versions they actually verified. This audit does not replace those historical verification versions with the newest package number.

## Scope and verification

Changes here cover prerequisite links, terminology, action ownership and one incorrect URL. The only checked-example source change is a TSDoc comment; both embedded shopping-list source disclosures receive the same change. There are no SDK behavior changes, dependencies, new routes or navigation changes.

The parent task runs the affected documentation checks and route report, inspects the built pages and recordings, and records that evidence in its delivery status. This audit records source findings; it does not claim those checks have passed.

The final API-selection increment replaces repeated capability matrices with one result/context table, adds the missing UI completion choice, and links checked learning paths. Platform guidance separates streaming server adapters, TypeSafe decisions, and browser-local inference. OpenAI/Azure Responses API requirements and provider SDK dependencies are grounded in current package source and manifests. The overview and comparison pages are intentional video exceptions: they link to relevant recorded tasks rather than adding a recording with no distinct interaction.

## Local verification, 2026-10-25

- `npx nx test www`: 137 files, 929 tests passed.
- `npx nx lint www`, `npx nx typecheck www`, and `npx nx build www`: passed.
- `npx nx e2e www` against the fresh build: all custom elements rendered; route parity includes 102 docs, 262 API pages, 14 blog posts, 117 share cards and all remaining public routes. All 496 pages have an Open Graph image.
- Both actual framework parser and chatbot clients passed desktop/mobile behavior checks before their four separate recordings. MP4/WebM playback, posters, result frames, captions and walkthroughs were reviewed. Unique ignored capture directories preserve raw video, masters and verification reports.
- Sixteen built-page checks covered the four updated recipe/comparison pages in each framework at 1440px and 390px. Desktop menu/content scrolling is independent; Migrations is last and collapsed; complete-source disclosures begin closed. All 24 new media assets return 200 with expected MIME types.
- Independent final source review found no actionable bugs or regressions. The mobile provider table was reduced to two columns after visual review.

The builds still report existing API Extractor/TSDoc export warnings, the Nx Rollup executor deprecation, Next.js dynamic-filesystem tracing warnings, and the NO_COLOR/FORCE_COLOR environment notice. Browser review reports existing unused-preload warnings and no console errors. No SDK source, package manifests or lockfiles changed. PR checks, merge and production deployment verification are the final delivery gates.
