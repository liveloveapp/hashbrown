# Angular and React learning journey audit

Reviewed 2026-10-30. Scope: all 110 authored documentation pages (55 routes per framework), with a deeper reading of Quickstart → conversation → tools/components → shared state → production. The route inventory below applies separately to `/docs/angular/` and `/docs/react/`.

## Review method

Reviewed openings, prerequisites, section structure, internal handoffs, terminology, repeated setup, and the distinction between application teaching and workbench inspection. Compared framework-relative link sets to catch asymmetric paths. Checked all documentation-to-documentation Markdown fragment links against target headings and explicit IDs. This is an editorial and navigation review; it does not qualify external provider releases or re-run their live deployments.

Voice references were read from `~/repos/brianflove/src/content/posts/`: the two 2024 posts (`2024-01-09-year-in-review.md` and `2024-01-11-success-in-the-ordinary.md`), `2018-03-04-rxjs-the-basics.md`, and `2020-06-05-angular-transfer-state.md`. The 2024 posts available in that checkout are personal/business writing, so the older technical posts supply the implementation-teaching reference: introduce the practical problem, show code, then explain the observable result. Historical technical claims in those posts are not treated as current guidance.

## Findings and changes

Each fix is paired across the two frameworks.

| Routes                       | Finding                                                                                                                                          | Change                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `start/quick`                | The first endpoint explanation introduces AG-UI and SSE without explaining the terms.                                                            | Expand AG-UI and SSE beside the first adapter explanation and identify events as run/content information over the open HTTP response.           |
| `concept/ai-basics`          | The concluding handoff moves to persistence; the central next lesson about instructions/tools is only mentioned earlier during inspection.       | Give the reader a direct instructions → tool-calling continuation while retaining the history branch.                                           |
| `concept/shared-agent-state` | A reader arriving from tools has no early comparison between a lookup and shared state.                                                          | Explain that a read-only lookup is enough when the agent does not need to update the document. Keep the agent-mapping prerequisite explicit.    |
| `start/overview`             | The learning paths cover components, typed data and endpoints, but omit the transition into state and approval workflows.                        | Add one purpose-specific state → interrupts → durable recovery path and state its AG-UI agent prerequisite.                                     |
| `recipes/public-endpoint`    | The security recipe starts at an advanced stream helper without a direct link back to the runnable endpoint and server-owned instruction lesson. | Link those prerequisites before the helper; retain the helper’s explicit incomplete-HTTP-handler boundary.                                      |
| `recipes/threads`            | The title promises resume, but the completed-text scope appears after the first implementation and workbench.                                    | Clarify resume-as-follow-up before the code and route paused approvals/native history to interrupts and durable recovery.                       |
| `migrations/v0-7`            | Both framework pages link to removed numbered UI-kit section fragments.                                                                          | Link to the current kit composition section, describe that narrower destination accurately, and link forward to the v0.8 rules migration.       |
| `migrations/v0-8`            | Both pages promise a full rules example at a missing `guide-the-model` fragment.                                                                 | Link to current component-catalogue guidance for names/descriptions; the migration’s own before/after rules example remains the implementation. |

## Intentional exceptions and retained structure

- Concept and recipe pages retain their ordinary application explanation and copyable implementation before `Explore it in the workbench`. Their subsequent canonical-plan implementation is a comparison, not setup the reader must copy into a product.
- Quickstarts remain complete standalone documents, including server dependencies and framework wiring. Concept pages link back to that setup instead of duplicating it. Angular bootstrap and React provider instructions remain framework-specific.
- The canonical plan is deliberately repeated across workbench lessons: it lets the reader compare one changed capability. Repeated replay instructions distinguish observations from network requests and application writes; they were retained where they explain that lesson’s evidence.
- Generic examples intentionally differ from the canonical workbench domain (books, delivery, trips, support). They establish a reusable contract before the plan-specific implementation.
- `platform/*` guides retain their provider-specific dependencies and caveats. An OpenAI workbench replay does not qualify Anthropic, Azure, Bedrock, Google, Ollama, custom providers, .NET, or LangGraph. TypeSafe’s JSON decision endpoint remains distinct from streaming AG-UI chat.
- `recipes/local-models` keeps its complete browser setup and device availability requirements; it is a separate runtime path. Ollama remains a server integration.
- Threadplane is a separately installed consumer, with different Angular/React ownership and mounting requirements. It is not advertised as another hosted lesson route.
- `platform/b4run` remains a separate opt-in durable reference with Postgres and identity requirements. The public/local teaching backend and browser text storage do not become durable checkpoint stores.
- Migration pages retain historical before/after APIs and their original heading IDs. Their recordings show current behavior and cannot prove historical version compatibility.
- No heading, explicit bookmark, code fence, diagram, lesson ID, or workbench count was changed. No broad “Next steps” boilerplate was appended and no prose-mirroring tests were added.

## Reviewed routes

Every row covers both framework routes. “Retained” means no editorial issue requiring a change was found within the review scope; it does not assert an external integration was executed.

| Route suffix                                  | Result                  |
| --------------------------------------------- | ----------------------- |
| `concept/activities`                          | Retained                |
| `concept/ai-basics`                           | Clarified; see findings |
| `concept/components`                          | Retained                |
| `concept/debugging`                           | Retained                |
| `concept/decisions`                           | Retained                |
| `concept/functions`                           | Retained                |
| `concept/interrupt-and-resume`                | Retained                |
| `concept/message-history`                     | Retained                |
| `concept/runtime`                             | Retained                |
| `concept/schema`                              | Retained                |
| `concept/shared-agent-state`                  | Clarified; see findings |
| `concept/streaming`                           | Retained                |
| `concept/structured-output`                   | Retained                |
| `concept/system-instructions`                 | Retained                |
| `concept/transform-request-options`           | Retained                |
| `guide/choosing-model`                        | Retained                |
| `guide/ethics`                                | Retained                |
| `guide/prompt-engineering`                    | Retained                |
| `migrations/threadplane`                      | Retained                |
| `migrations/v0-5`                             | Retained                |
| `migrations/v0-6`                             | Retained                |
| `migrations/v0-7`                             | Clarified; see findings |
| `migrations/v0-8`                             | Clarified; see findings |
| `platform/anthropic`                          | Retained                |
| `platform/azure`                              | Retained                |
| `platform/b4run`                              | Retained                |
| `platform/bedrock`                            | Retained                |
| `platform/custom`                             | Retained                |
| `platform/dotnet`                             | Retained                |
| `platform/dotnet-native-tools`                | Retained                |
| `platform/google`                             | Retained                |
| `platform/langgraph`                          | Retained                |
| `platform/ollama`                             | Retained                |
| `platform/openai`                             | Retained                |
| `platform/typesafe`                           | Retained                |
| `recipes/browser-history`                     | Retained                |
| `recipes/decisions-in-agents`                 | Retained                |
| `recipes/json-parser`                         | Retained                |
| `recipes/local-models`                        | Retained                |
| `recipes/prose`                          | Retained                |
| `recipes/natural-language-to-structured-data` | Retained                |
| `recipes/predictive-actions`                  | Retained                |
| `recipes/public-endpoint`                     | Clarified; see findings |
| `recipes/threadplane`                         | Retained                |
| `recipes/threads`                             | Clarified; see findings |
| `recipes/ui-chatbot`                          | Retained                |
| `recipes/ui-kits`                             | Retained                |
| `recipes/ui-selection`                        | Retained                |
| `start/how-it-works`                          | Retained                |
| `start/intro`                                 | Retained                |
| `start/overview`                              | Clarified; see findings |
| `start/platforms`                             | Retained                |
| `start/quick`                                 | Clarified; see findings |
| `start/sample`                                | Retained                |
| `start/workbench`                             | Retained                |

## Verification

Passed the following existing tests through `npx nx test www --excludeTaskDependencies --output-style=static --args='… --maxWorkers=2'`, with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true`: 8 files, 323 tests.

- `test/docs/concept-first-guides.spec.ts`
- `test/docs/workbench-guides.spec.ts`
- `test/docs/workflow-guides.spec.tsx`
- `test/docs/workbench-workflow-guides.spec.ts`
- `test/docs/workbench-history-guides.spec.ts`
- `test/docs/workbench-server-guides.spec.ts`
- `test/docs/production-guides.spec.tsx`
- `test/docs/recipe-application-snippets.spec.ts`

A source comparison against HEAD confirmed unchanged headings, explicit bookmarks, code fences, diagrams and workbench embeds in all 16 edited documentation pages. A local link scan checked 757 internal documentation Markdown links across all 110 pages, including their heading/explicit-ID fragments; no missing targets remained. `git diff --check` passed.

The test run emitted only the existing environment warning that `NO_COLOR` is ignored while `FORCE_COLOR` is set. This editorial task did not run a production build, broad browser e2e, provider requests or SDK release; integrated build/lint/e2e verification belongs to the parent task.
