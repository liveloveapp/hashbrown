# Documentation media inventory

Updated 2026-10-26. Paths are below `/docs/<sdk>/`; React and Angular share a recording when the visible behavior is the same. Verify both SDK implementations before sharing a capture. This is a production backlog, not a claim that every guide has a recording.

## Current recordings

The canonical conversation workbench now has separate `canonical-workbench-react` and `canonical-workbench-angular` captures on `start/workbench`. These use the checked framework clients, real OpenAI requests, the actual browser tool, streamed SDK parsing, trusted components and explicit local acceptance. Both live-provider runs passed with four requests each. Footage is slowed to half speed for readability; both videos retain the `Live model` provenance label. The separate deterministic browser suite is labelled `test-fixture` and is not used for these recordings.

| Recording     | Source                                                                                     | Pages                                         | Notes                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Welcome card  | `www/examples/quickstart/{react,angular}`                                                  | Retained legacy asset | Real client rendering; deterministic AG-UI output; presentation CSS added in recorder            |
| Conversation  | `www/examples/quickstart/{react,angular}`                                                  | Retained legacy asset       | Name and follow-up in the same instance; does not demonstrate persistence                        |
| Persistence   | `SavedConversations.tsx` / `saved-conversations.ts` and each framework’s `text-history.ts` | Message history, Browser history              | Completed text only; refresh, two independent selections, and a follow-up using restored history |
| Interrupts    | `www/examples/quickstart/{react,angular}`                                                  | Interrupt and resume                          | Two-answer approval batch followed by the resumed result                                         |
| Shared state  | `www/examples/quickstart/{react,angular}`                                                  | Shared agent state                            | Local destination edit sent to the agent; streamed agent update shown in the app                 |
| Activities    | `www/examples/quickstart/{react,angular}`                                                  | Activities                                    | Itinerary progress reaches completion                                                            |
| UI kits       | `www/examples/quickstart/{react,angular}`                                                  | UI kits                                       | Select and render two trusted component types from one reusable kit                              |
| Generative UI | `examples/atc`                                                                             | Earlier ATC capture; retained asset | Trusted ATC components                                                                           |
| Streaming     | `examples/atc`                                                                             | Earlier ATC capture; retained asset           | Incremental ATC response                                                                         |
| Browser tools | `examples/atc`                                                                             | Earlier ATC capture; retained asset | Fixture traffic read through tools                                                               |
| Schemas       | `examples/atc`                                                                             | Earlier ATC capture; retained asset | Typed flight filter                                                                              |
| Decisions     | `examples/atc`                                                                             | Earlier ATC capture; retained asset | Intent routing and component narrowing                                                           |
| Debugging     | `examples/atc`                                                                             | Earlier ATC capture; retained asset | ATC-specific inspector, separate from Redux DevTools                                             |

All recordings have MP4, WebM, a poster, captions, and a text walkthrough under `www/public/video/docs`. Welcome card, conversation, and the five workflow recordings have result screenshots. ATC captures disclose fixture traffic and scripted responses. Earlier tutorial captures disclose scripted AG-UI responses and use the checked client example files. The local-model recording below uses real native inference. The workflow recorder verifies both frameworks and records their shared visible behavior from React.

The persistence capture demonstrates application-owned, versioned browser storage of completed text messages. It does not save canonical agent checkpoints, tools, generated UI, shared state, or pending interrupts. The separate server-thread example below covers server-owned completed text with optimistic version checks; neither example restores canonical agent checkpoints.

## Production and runtime recordings

These three recordings use checked examples and existing guide pages. Both frameworks, final encodes, posters, captions, walkthroughs, and result frames have been verified.

| Recording ID         | Checked source                                                                                                        | Pages                     | Recorded interaction                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-endpoint`    | `server/thread-app.ts`, `server/thread-server.ts`; recorder access fixture                                            | `recipes/public-endpoint` | Reject an unauthenticated run, accept a local fixture session, stream a reply, and reject a foreign owner's thread.                            |
| `server-threads`     | `ServerConversations.tsx` / `server-conversations.ts`, each framework's `server-history.ts`, `server/thread-store.ts` | `recipes/threads`         | Load saved text before chat creation, save a completed turn, refresh, switch conversations, surface a version conflict, and explicitly reload. |
| `javascript-runtime` | `RuntimeDemo.tsx` / `runtime-demo.ts`, `runtime/basket.ts`                                                            | `concept/runtime`         | Run a prewritten basket calculation in real QuickJS, fail browser access and invalid host arguments, then calculate successfully again.        |

The endpoint and thread recordings use opaque local fixture sessions, an in-memory repository, and scripted provider events. They do not demonstrate a deployed login service, durable database, or live model response. `createProductionThreadApp` in `server/thread-server.ts` supplies the real OpenAI stream adapter and fixes the model/output policy on the server; the application must inject its verified identity, atomic database store, and shared admission control. The fixture integrations remain recorder-only.

The runtime recording submits visible prewritten scripts to real QuickJS through the public framework APIs. Its basket host handler validates arguments explicitly; runtime schemas describe the contract and do not automatically validate the bridge's inputs or results. Host handlers execute outside QuickJS with host privileges. No model or provider key is needed for the direct runtime example.

## Typed data and form recordings

`structured-form` and `streaming-data` use `StructuredList.tsx` / `structured-list.ts` and shared `runtime/shopping-list.ts`. Both SDKs run the same checked behavior; React supplies the recordings. The model response is scripted AG-UI output with deliberately delayed chunks and added presentation CSS. No live model, server write, or purchase is shown.

The first recording demonstrates generating, reviewing and explicitly applying a typed shopping list. The second shows complete array items arriving while Apply remains disabled until successful completion and application validation. Result screenshots show draft and applied values separately. Both have MP4/WebM, poster, VTT and a text walkthrough.

`concept/structured-output` now introduces the canonical two-step plan. The schema and streaming guides now use the canonical plan. The natural-language form recipe retains its checked shopping-list example during the staged rollout. The earlier `streaming-data` shopping-list clip is retained as legacy media; the Streaming guide uses its framework-specific canonical plan capture.

## Assisted interface recordings

Three task-based recipes use the checked clients in `www/examples/quickstart` and shared helpers in `runtime`. Both SDKs are exercised before React supplies the shared recordings. All three include MP4/WebM, a poster, captions, a text walkthrough and a result screenshot.

| Recording ID             | Pages                        | Recorded interaction                                                                                                          |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `magic-text`             | `recipes/magic-text`         | Stream a Markdown packing reply, then select a resolved citation to open application-owned source details without navigation. |
| `predictive-suggestions` | `recipes/predictive-actions` | Request a context-bound packing proposal, accept Passport and dismiss Phone charger without another completion request.       |
| `ui-selection`           | `recipes/ui-selection`       | Choose between a shopping summary and item list while keeping the item names and quantities in application code.              |

Magic Text and suggestions use scripted AG-UI responses; UI selection uses scripted decision responses. These are real client interactions with added presentation CSS, no narration or live model calls. The packing list is component-local state. A source citation does not establish factual correctness, and decision confidence is not a calibrated measure of usefulness. The checked `server/selection-server.ts` pins the selection questions for real TypeSafe requests; the recorder substitutes responses without requiring credentials.

## Streaming JSON parser recordings

`json-parser-react` and `json-parser-angular` record the separate checked framework clients and shared `runtime/json-parser-demo.ts`. A finite local source sends JSON chunks without a model, weather service, or provider key. Both clients pass desktop and mobile checks before either recording is captured.

The interaction starts, stops, resets, and restarts the stream. A city waits for its closing quote, forecast text grows as it arrives, and an alert appears when its required field values resolve. The final success state requires source EOF, parser completion, and validation of the raw document. Browser checks also cover malformed, truncated, missing-field, wrong-type, and schema-invalid inputs, cancellation, replacement, unmount, and recovery. Both recordings include independently reviewed MP4/WebM, poster, captions, walkthrough, and result screenshot.

Reproduce with `npx nx docs-parser-demo www`. Use `DOCS_SKIP_RECORDING=1` for browser checks without replacing media, or `DOCS_DEMO_MODES=json-parser-react,json-parser-angular` to select captures. Both clients are verified even when selecting one capture. Unique run directories under ignored `dist/docs-parser` preserve raw captures, masters, measured phases, and verification reports.

## Generative UI chatbot recordings

`ui-chatbot-react` and `ui-chatbot-angular` record the separate checked `LightChatbot.tsx` / `light-chatbot.ts` clients and shared `runtime/light-chatbot.ts`. The actual browser tool reads a simulated Desk light at 80%. A scripted HTTP AG-UI continuation selects a trusted proposal component; explicit Apply changes local state to 40%. A second real tool call reads revision 1 and the trusted reading component displays 40%. No real device or live model is used.

Both clients pass desktop, mobile, keyboard, invalid-value, unsuccessful-run, streaming-time Apply, repeat/revision, cancellation, unmount, and overlapping-response checks before capture. The overlap check holds an old terminal response until a newer turn completes, then verifies it cannot authorize an old card. Each recording includes reviewed MP4/WebM, poster, captions, walkthrough and result screenshot.

Reproduce with `npx nx docs-ui-chatbot-demo www`. `DOCS_SKIP_RECORDING=1` runs checks without replacing assets; `DOCS_DEMO_MODES=ui-chatbot-react,ui-chatbot-angular` selects captures. Both clients are always verified. Unique ignored `dist/docs-ui-chatbot` directories preserve wire requests, raw captures, masters, measured phases and verification reports.

## Remaining production work

Record the uncovered tasks listed below using each guide's own interaction. Each recording needs a deterministic fixture, an example owner, a visible success result, and a written guide that stands on its own. Reuse installed recording tools; no new hosting dependency.

## Page coverage

| Page                                          | Status                | Recording or remaining work                                                                                                |
| --------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `concept/activities`                          | Recorded              | activities                                                                                                                 |
| `concept/ai-basics` | Recorded | canonical-workbench-conversation-react / canonical-workbench-conversation-angular |
| `concept/components`                          | Recorded              | canonical-workbench-ui-react / canonical-workbench-ui-angular                                                              |
| `concept/debugging` | Recorded | canonical-workbench-debugging-react / canonical-workbench-debugging-angular |
| `concept/decisions`                           | Recorded              | canonical-workbench-decisions-react / canonical-workbench-decisions-angular                                                |
| `concept/functions`                           | Recorded              | canonical-workbench-tools-react / canonical-workbench-tools-angular                                                        |
| `concept/interrupt-and-resume`                | Recorded              | interrupts                                                                                                                 |
| `concept/message-history`                     | Recorded              | persistence; completed text only                                                                                           |
| `concept/runtime`                             | Recorded              | javascript-runtime; real QuickJS calculation, errors, and recovery.                                                        |
| `concept/schema`                              | Recorded              | canonical-workbench-schemas-react / canonical-workbench-schemas-angular                                                    |
| `concept/shared-agent-state`                  | Recorded              | shared-state                                                                                                               |
| `concept/streaming`                           | Recorded              | canonical-workbench-streaming-react / canonical-workbench-streaming-angular                                                |
| `concept/structured-output`                   | Recorded              | canonical-workbench-structured-react / canonical-workbench-structured-angular                                              |
| `concept/system-instructions` | Recorded | canonical-workbench-system-instructions-react / canonical-workbench-system-instructions-angular; actual provider mapping evidence |
| `concept/transform-request-options` | Recorded | canonical-workbench-request-transformation-react / canonical-workbench-request-transformation-angular |
| `guide/choosing-model`                        | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                                     |
| `guide/ethics`                                | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                                     |
| `guide/prompt-engineering`                    | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                                     |
| `migrations/v0-5`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                          |
| `migrations/v0-6`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                          |
| `migrations/v0-7`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                          |
| `migrations/threadplane`                      | Intentional exception | Framework-specific presentation/runtime changes and migration boundaries are easier to scan as steps.                      |
| `migrations/v0-8`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                          |
| `platform/anthropic`                          | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/azure`                              | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/bedrock`                            | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/custom`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/dotnet`                             | Intentional exception | Server hosting and provider configuration belong in named, copyable files; conformance verifies the integration.           |
| `platform/google`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/ollama`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/openai`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `platform/typesafe`                           | Intentional exception | Credentials and host configuration belong in named, copyable files.                                                        |
| `recipes/browser-history`                     | Recorded              | persistence; application-owned versioned browser storage of completed text.                                                |
| `recipes/decisions-in-agents`                 | Recorded              | agent-routing and agent-fallback; checked server routing, clarification, failure and explicit retry.                       |
| `recipes/json-parser`                         | Recorded              | json-parser-react and json-parser-angular; finite local chunks, partial previews, stop/reset, and raw-document validation. |
| `recipes/local-models`                        | Recorded              | local-models; real Chrome inference extracts a typed trip brief after explicit preparation.                                |
| `recipes/magic-text` | Recorded | canonical-workbench-magic-text-react / canonical-workbench-magic-text-angular |
| `recipes/natural-language-to-structured-data` | Recorded              | structured-form; generate a typed draft, validate, review, and explicitly apply.                                           |
| `recipes/predictive-actions` | Recorded | canonical-workbench-predictions-react / canonical-workbench-predictions-angular |
| `recipes/public-endpoint`                     | Recorded              | public-endpoint; session and owner checks before scripted provider streaming.                                              |
| `recipes/threadplane`                         | Recorded              | threadplane-react and threadplane-angular; separately installed consumers, runtime checks and media review passed.         |
| `recipes/threads`                             | Recorded              | server-threads; server-owned completed text, version conflict, and explicit reload.                                        |
| `recipes/ui-chatbot`                          | Recorded              | ui-chatbot-react and ui-chatbot-angular; real browser read tool, trusted proposal, explicit Apply, and updated follow-up.  |
| `recipes/ui-kits`                             | Recorded              | ui-kits                                                                                                                    |
| `recipes/ui-selection` | Recorded | canonical-workbench-ui-selection-react / canonical-workbench-ui-selection-angular |
| `start/how-it-works` | Recorded | canonical-workbench-first-plan-react / canonical-workbench-first-plan-angular; tool-free request path |
| `start/intro` | Recorded | canonical-workbench-first-plan-react / canonical-workbench-first-plan-angular |
| `start/overview`                              | Intentional exception | Decision table links to checked task recordings; no separate interaction to demonstrate.                                   |
| `start/platforms`                             | Intentional exception | Runtime and provider setup comparison links to runnable guides and their recordings.                                       |
| `start/quick` | Recorded | canonical-workbench-first-plan-react / canonical-workbench-first-plan-angular; shared standalone PlanCard |
| `start/sample`                                | Recorded              | Existing `www-atc-demo-video` player; full ATC interaction.                                                                |

## Content gaps after this increment

- **Canonical persistence:** completed-text browser storage is covered, including version checks and restoration failures. The server-thread increment adds an application-owned completed-text contract and atomic version checks. Durable canonical agent checkpoints, generated UI/tool history, shared state, and interrupted workflows still need a separate design and example.
- **Production integration:** the checked endpoint exposes identity, ownership, request policy, admission, and atomic storage integration points. A deployed identity/session service, database, distributed limits, retention policy, and operational observability remain application responsibilities. Recorder fixtures do not satisfy those deployment requirements.
- **Editorial:** continue replacing dense API inventories in learning pages with a minimal task and links to generated reference. Verify stale snippets before editing prose around them.
- **Typography:** the system sans-serif comparison is complete as a local review artifact. The site font remains unchanged; selecting or shipping a typography change is separate work.

## Reproduction

`npx nx typecheck www` checks client and server files, including Angular strict templates. The docs tests compare published code blocks with the checked example files.

For welcome card and conversation, run `npx nx docs-demo www`. The recorder verifies React and Angular loading, success, follow-up history, and welcome-card error recovery. It writes capture masters and verification reports to ignored `dist/docs-quickstart`.

For persistence, interrupts, shared state, activities, and UI kits, run `npx nx docs-workflows-demo www`. It builds static clients, verifies both frameworks, and captures the shared interactions from React. The fixtures require no provider key. Captures, masters, static browser builds, and `verification.json` go to ignored `dist/docs-workflows`. These recorders publish encodes, posters, and result screenshots to `www/public/video/docs`; captions and walkthroughs live beside them.

Use `DOCS_SKIP_RECORDING=1 npx nx docs-workflows-demo www` to exercise the clients without writing new videos or screenshots. Select a comma-separated subset with `DOCS_DEMO_MODES`, for example `DOCS_DEMO_MODES=persistence,interrupts npx nx docs-workflows-demo www`. Unknown mode names fail immediately. The storage failure checks still run for both SDKs when selecting a subset.

The workflow checks confirm refresh restoration without a new request, isolated conversation selections, the restored transcript in a follow-up request, the complete interrupt response batch, shared-state request content, activity completion, and both UI kit component types. They also check malformed saved-history preservation and explicit clearing, storage quota failures, and shared-state rollback after `RUN_ERROR` when that mode is selected. These checks do not establish durable interrupt recovery across refreshes.

For this increment, run `npx nx docs-production-demo www`. It builds static clients and writes browser builds, capture masters, result frames, and `verification.json` to ignored `dist/docs-production`. Published encodes, posters, result screenshots, captions, and text walkthroughs belong in `www/public/video/docs`. Both framework verification and media review passed for this increment.

Use `DOCS_SKIP_RECORDING=1 npx nx docs-production-demo www` to verify without replacing captures. Filter with `DOCS_DEMO_MODES=public-endpoint,server-threads,javascript-runtime npx nx docs-production-demo www`, or select a subset. Unknown names fail immediately, and skip/filter options can be combined. The production modes use their own three IDs; the workflow target retains its five separate mode names. Server-thread failure checks run when `server-threads` is selected; fresh-context, timeout, and recovery checks run when `javascript-runtime` is selected.

Run the recorders sequentially: all use `dist/docs-quickstart/compiled`. Review final frames, posters, captions, and walkthroughs after capture, and confirm the verification report before treating a recording as ready to publish.

For typed data, run `npx nx docs-structured-demo www`. Use `DOCS_SKIP_RECORDING=1` for verification only, or select `structured-form,streaming-data` with `DOCS_DEMO_MODES`. Captures/masters/static builds and `verification.json` stay in ignored `dist/docs-structured`. Browser checks exercise progressive complete items, explicit Apply, invalid application values, failures after partial and complete JSON, empty replacements, malformed/truncated output, cancellation after valid JSON, and recovery in both SDKs.

For the assisted recipes, run `npx nx docs-recipes-demo www`. Use `DOCS_SKIP_RECORDING=1` to verify without replacing assets and `DOCS_DEMO_MODES=magic-text,predictive-suggestions,ui-selection` to choose a subset. Unknown modes fail. Captures, masters, static builds and `verification.json` remain in ignored `dist/docs-recipes`. Run sequentially with the other recorders because they share compiled output.

These browser checks cover streaming/finalization and citation interaction, complete-only suggestion actions, current-context guards, duplicate/invalid/empty/failed/cancelled responses, selection fallback and late responses. They exercise the real React and Angular APIs against deterministic local fixtures, not model accuracy or a deployed TypeSafe service.

## Learning-sequence audit

- Quickstart remains the first trusted-component success. How Hashbrown works and Choosing an API now point to complete task-based routes instead of leaving readers to infer the relationship between API names.
- The typed-data route is schemas → structured output → streaming → natural-language forms. Fundamentals readers who reach Streaming early get explicit prerequisites and links to the checked example.
- The conversation route remains messages → system instructions → history, then tools or workflow guides. Storage and runtime guides explain their separate lifetime and production boundaries.
- CopilotKit learning content is retired with compatibility redirects. Threadplane integration and chat-migration guides cover each framework’s actual presentation and runtime boundary. Remote MCP learning pages are retired with compatibility redirects; local models now has a checked browser-native workflow and real-inference recording. Decisions in Agents now connects a checked server router to ordinary framework chat clients. Magic Text, predictive suggestions and UI selection now have small checked tasks, complete source disclosures and their own recordings.
- Predictive suggestions now provide an independent input-driven structured-completion example. Its stable context snapshot avoids a request feedback loop when suggestions are accepted or dismissed. The typed-list tutorial separately uses an explicit chat action and fresh conversation per request. No claim of universal page coverage or a finished editorial pass is made.

## Server-side agent decisions

Run `npx nx docs-agent-decisions-demo www` sequentially with the other recorders. `DOCS_SKIP_RECORDING=1` checks behavior without replacing assets; `DOCS_DEMO_MODES=agent-routing,agent-fallback` selects these target-specific IDs. Unknown modes fail. Captures, masters, static clients and verification reports remain in ignored `dist/docs-agent-decisions`.

Both real framework clients call the checked Express agent and router. Only classifier envelopes and failures are scripted; application handlers create final replies. Checks cover no initial request, both handlers, uncertain/invalid/failed classifications, missing or unknown order IDs, unexpected run failures, cancellation and stale-response isolation, explicit retry, mobile layout and encoded playback. Unit/HTTP tests additionally check server-pinned input, request limits and cancellation before handlers. The public example data does not represent a customer account, a deployed identity system, or model accuracy. SDK release remains separate.

## Browser-native local models

`npx nx docs-local-models-demo www` verifies the checked LocalModels clients with deterministic native-API shims, then uses real Chrome inference in both frameworks before recording React. The primary `local-models` footage is actual native inference, not a scripted answer. Added presentation CSS and output variability are disclosed. Native verification requires an already available model in the dedicated test profile; the recorder never initiates a model download and is local-only.

Shim checks cover explicit preparation, unavailable/missing APIs, progress/failure, cancellation and late session cleanup, malformed/invalid/failed/truncated generation and recovery. Mobile checks establish layout and shim contracts, not native mobile inference. Captures, masters, static clients and reports remain in ignored `dist/docs-local-models`. Use `DOCS_SKIP_RECORDING=1` for verification without replacing public media; `DOCS_DEMO_MODES=local-models` selects the sole ID and unknown names fail. Run sequentially with all other recorders and GPU suites.

Remote MCP was removed from navigation, content search, LLM listings and this recording backlog. Old React/Angular recipe and Markdown URLs redirect permanently to each SDK's Tool calling guide. This retirement does not remove MCP SDK capabilities.

## Threadplane chat presentation

Both separately installed consumer workflows passed browser verification on desktop and mobile. Separate 1440×900 recordings, MP4/WebM playback and visual review passed: React 12.47 seconds and Angular 12.63 seconds. Result screenshots measure 920×552 and 920×626 respectively. `dist/docs-threadplane/verification.json` records the runtime results, and `installed-packages.json` records resolved dependency versions, realpaths and CSS exports.

| Recording ID          | Installed consumer                                                                                                                                                                  | Interaction and boundary                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `threadplane-react`   | React/React DOM 19.2.8, Hashbrown core/React 0.8.0; private Threadplane core/content/react built at `2c7f01fa958441f3ed94e2559987217be284e94a` and installed with `--install-links` | Actual `ChatInput` and `TextTranscript` compose a Hashbrown conversation. Send a shipping question, read a streamed reply, and send a follow-up with canonical history. |
| `threadplane-angular` | Angular 22.1.1; published `@threadplane/chat` and `@threadplane/ag-ui` 0.3.3 with AG-UI client/core 1.0.2                                                                           | Actual full `ChatComponent` uses Threadplane’s AG-UI runtime against the same Hashbrown server boundary. It has its own welcome/composer, transcript and stop controls. |

Each ID has its own MP4, WebM, poster, result screenshot, measured VTT captions and text walkthrough. The actual Hashbrown OpenAI 0.8.0 adapter runs against provider-native scripted Responses events over local HTTP. Added presentation styles, header/footer and scripted output are disclosed; no provider key or live model is used. React footage must not stand in for the Angular screen.

Checked source lives in `www/examples/threadplane-consumers`. `docs-threadplane-consumers.ts` and `prepare-docs-threadplane.ts` prepare/build disposable consumers in ignored `dist/docs-threadplane/{react,angular}` with actual installed dependencies and no source aliases. `record-docs-threadplane.ts` consumes their built `dist/index.html` files. It requires manifests and lockfiles, records resolved versions/realpaths/CSS, checks framework peer identity, and compiles the checked server against its installed dependencies.

Use `DOCS_SKIP_RECORDING=1` when running the recorder for verification only. `DOCS_DEMO_MODES=threadplane-react,threadplane-angular` selects these two IDs or a subset; unknown values fail. Both consumer workflows must pass before either public recording is replaced. Run installs, source builds, consumer builds, browser verification and recording sequentially. New captures, frames, phase measurements and masters use unique ignored `dist/docs-threadplane/captures/<run-id>` directories; existing masters are preserved. Reports remain alongside the consumers.

Passed runtime checks cover no automatic request, streaming, same-thread/fresh-run follow-up with the canonical assistant ID, keyboard submission/newline, failed and truncated output, explicit recovery, stop/late-response isolation, navigation cancellation, fresh-page history and mobile overflow. With published Hashbrown 0.8.0, React removes the unfinished assistant reply after Stop and retains completed turns. The Threadplane Angular 0.3.3 adapter retains partial assistant text. Navigation cancellation establishes the observed HTTP lifetime; it does not independently instrument every internal disposal callback. Encoded playback, video contact sheets, posters, captions and result screenshots passed review. The Angular mobile check also verifies that the composer stays inside its chat container.

Migration guides keep authentication, authorization, system policy, history, tools and component contracts explicit, and link to the corresponding framework’s own walkthrough. CopilotKit recipe HTML and Markdown bookmarks redirect to the React Threadplane guide.

## Server request transformation

Run `npx nx docs-request-transform-demo www` sequentially with other recorders. `DOCS_SKIP_RECORDING=1` verifies without replacing media; `DOCS_DEMO_MODES=request-transformation` selects its sole mode and unknown values fail. The ten-second recording runs the checked React client, Express endpoint, asynchronous transform and actual OpenAI adapter. Only identity/context integrations and provider-native Responses output are scripted locally. Angular passes the same interaction checks before React is captured.

Checks cover trusted instructions at the actual provider boundary, forged browser policy isolation, identity/authorization/context failures, provider failure and truncation, cancellation before and during provider work, stale-run isolation, explicit recovery, no automatic request, mobile overflow and both video formats. Unit tests additionally preserve populated provider tools/schema/store/include/reasoning without mutation. Six public assets include the measured captions, walkthrough and 920×522 result frame; captures/masters/reports stay in ignored `dist/docs-request-transform`.

## Canonical workbench shell re-record

Updated 2026-10-26. The fourteen earlier lessons and two overview IDs had their
`canonical-workbench-*` videos, posters, result screenshots, captions and
walkthroughs re-recorded against the redesigned shell: a
collapsible sectioned sidebar, a resizable chat and inspector split, one
inspector that pairs captured and interpreted content, and an icon player bar.
Recordings ran in fresh browser contexts, so they show the default layout
(expanded sidebar, every section open, a 44/56 split). Sources are unchanged:
real OpenAI (`gpt-4.1-mini`) and TypeSafe (`jev-1.14.0`) requests through the
actual framework SDKs, in four `WORKBENCH_LESSONS` batches. All 30 recordings
passed provider verification on the first attempt. Verifiers select milestone
ticks by keyboard, because live runs crowd adjacent ticks closer than a pointer
can separate.

## Canonical concept workbench

The React and Angular components, tools and structured-output guides use six separate real-provider recordings: `canonical-workbench-{ui,tools,structured}-{react,angular}`. The two workbench overview IDs are refreshed from their matching Generative UI capture. All use the same two-step plan, LLA light surfaces, the sectioned sidebar, a chat and inspector split, the bottom player bar and immutable synchronized playback. Every streaming frame remains available under Raw events.

Run `npx nx workbench-demo www` with server-only OpenAI credentials/model after deterministic `npx nx workbench-e2e www` passes. The recorder verifies actual framework SDKs and the OpenAI adapter before replacing media; fixture source is rejected. It encodes half-speed readable footage, measured multi-phase captions, posters, final screenshots and honest walkthroughs. Fixture checks stay under ignored `dist/docs-workbench/verification`; each real recording preserves its report and original captures under a unique `dist/docs-workbench/captures/<run-id>` directory. The structured lesson uses actual structured-chat APIs and plain plan JSON; the UI lessons use exposed SummaryCard components. A tool reads application context in every turn; only explicit fresh, completed acceptance changes state. No SDK release is involved.

## Canonical streaming, schemas and decisions

Updated 2026-10-26. The React and Angular `concept/streaming`, `concept/schema`
and `concept/decisions` guides use separate
`canonical-workbench-{streaming,schemas,decisions}-{react,angular}` captures.
Streaming and schemas use actual structured-chat SDKs and OpenAI. Streaming
verification observes real partial title values before successful completion;
the Schema view displays the shared contract and preview validation.

Decisions uses actual `useDecision` / `decisionResource` and TypeSafe with the
pinned `jev-1.14.0` model. The application owns the fixed plan. Whole JSON
responses contain only the closed nextAction choice and metadata. A fresh,
completed choice at confidence >=0.75 can be explicitly used; low confidence,
errors and cancellation preserve state with manual review guidance. Neither
rendering nor replay performs an application write.

The selected-batch recorder verifies both framework implementations, provider
provenance and semantic follow-ups before encoding. Each ID has MP4/WebM, poster,
result screenshot, five measured caption phases and an honest text walkthrough.
Reports/originals remain in unique ignored `dist/docs-workbench/captures` runs.
CI exercises all twelve framework/lesson paths with labelled fixtures, including
low confidence, failure, cancellation/replacement and retained conversation
navigation. No SDK release or new dependencies.

Recording presentation: the new OpenAI streaming/schema captures pace unchanged provider events at 20 ms so browser batching does not hide previews. This is disclosed in the media notes and walkthroughs. The normal demo host adds no delay; complete TypeSafe decisions are not paced as streams.

## Canonical debugging and request transformation

The Angular and React debugging and request-transformation guides now select
`canonical-workbench-{debugging,request-transformation}-{angular,react}` rather
than the earlier ATC debugging and scripted Northstar support clips. Legacy
assets remain for old bookmarks and unrelated fixture checks.

The debugging recording includes a deliberate local HTTP 403 before provider
invocation, followed by same-conversation recovery through the actual UI-chat
SDK and real OpenAI adapter. Its `demo-failure` source remains attached to the
selected historical request. The switch is a demonstration, not authentication.
Acceptance and the follow-up retain the same explicit application revision rules.

The transformation recording follows the real provider callback after mapping.
It captures public before/after options and preservation checks, adds fixed
server-owned workspace instructions, and omits input messages, headers and
credentials from the trace. Replay synchronizes chat, JSON, UI and state without
provider calls or writes. Each framework gets separate MP4/WebM, poster,
result screenshot, measured captions and an honest text walkthrough.

Run `WORKBENCH_LESSONS=debugging,request-transformation npx nx workbench-demo www`
with server-only OpenAI credentials, sequentially with other builds/recorders.
The recorder rejects fixture provenance for successful provider turns; the local
debug denial is disclosed separately. Presentation pacing and half-speed footage
are disclosed. Originals, phase times and verification reports remain under the
unique ignored `dist/docs-workbench/captures/<run-id>` directory.

## Canonical recipe workbench

The six Angular and React recipe guides for Magic Text, predictive suggestions,
and UI selection use `canonical-workbench-{magic-text,predictions,ui-selection}-{react,angular}`.
Each lesson keeps the application-owned two-step plan, LLA light shell,
bottom milestone timeline, independent conversations and immutable captured
history. Earlier packing/shopping media remains available for bookmarks and
independent fixture checks; the active guides use the matching framework's new
canonical recording.

Magic Text uses genuine text-chat APIs, browser readContext calls and the SDK's
Markdown renderer in both live and historical views. Source details come from
an actual renderer citation selection; the supplied reference is not evidence
of retrieval or correctness. Predictions use structured-completion APIs with an
explicit current context, a known action catalogue and bounded reasons. Only
fresh complete successful proposals can be accepted, and accepting one makes
siblings stale. Dismissal changes presentation without applying an action.

UI selection uses genuine UI decision candidates and the TypeSafe boundary.
Components, plan data and props belong to the app; the model selects only a
known ID. Whole responses and confidence are shown honestly. Use view or manual
choice is explicit. Low confidence and failed, stale or cancelled results cannot
apply a model choice. The recording finishes with a manual steps choice at
revision 2 and preserves the actual confidence score. Manual selection cancels pending work and blocks late
overwrite. Captured rendering has no live action handlers or provider calls.

Run `WORKBENCH_LESSONS=magic-text,predictions,ui-selection npx nx workbench-demo www`
with the existing server-only OpenAI and TypeSafe credentials/models. Both
frameworks and all selected live semantic paths must pass before publication.
Each media ID has MP4/WebM, poster, result image, measured VTT captions and a text
walkthrough. Source provenance, filming-only pacing and half-speed playback are
disclosed. Keep originals and phase reports in unique ignored
`dist/docs-workbench/captures/<run-id>` directories. No SDK release or new dependencies.

## Canonical onboarding and conversation fundamentals

Introduction, Quickstart and How Hashbrown works now share the framework-specific
`canonical-workbench-first-plan-{react,angular}` recordings. The standalone
FirstPlanApp and workbench expose the same pure PlanCard as SummaryCard with only
title and streaming steps. One request generates a preview; no browser tool,
acceptance action or application write is shown. Older WelcomeCard entry points
and media remain available to existing fixtures and bookmarks.

Messages and turns uses `canonical-workbench-conversation-{react,angular}`. Two
plain-text requests retain earlier messages and thread identity while each run
gets a fresh ID. These local conversations are not durable storage. System
instructions uses `canonical-workbench-system-instructions-{react,angular}` and
compares the actual browser declaration with the fixed public server policy
observed inside the OpenAI adapter mapping callback. Only the allowlisted public
policy is captured, not private provider input or credentials.

All six videos use real OpenAI requests and actual framework SDKs, with separate
labelled deterministic tests. Measured captions, both codecs, posters, result
images and walkthroughs accompany each capture. Presentation event pacing and
half-speed footage are disclosed. Replay is inert. The full workbench suite now
covers seventeen lessons and 34 framework paths. Run
`WORKBENCH_LESSONS=first-plan,conversation,system-instructions npx nx workbench-demo www`
with existing server-only OpenAI credentials/model, sequentially with other
builds/recorders. Keep raw captures and reports in a unique ignored directory.
No SDK release or new dependencies.


## Canonical shared state, activities, and interruption

The six Angular/React guides now use
`canonical-workbench-{shared-state,activities,interrupts}-{react,angular}`.
The same two-step plan remains application-owned. Text chat uses actual SDKs
and real OpenAI streaming. The checked local AG-UI agent explicitly maps state
into provider context and authors state, activity, and approval events around
unchanged provider text. Direct provider adapters do not invent those workflows.

Shared state shows explicit local replacement without generation, draft updates,
commit and a second request carrying state. Activities report actual context
validation and successful provider completion, with stable SDK links and fresh
IDs per run. Interrupts resumes a whole two-question batch in the same user turn,
then pauses the next ordinary turn on a fresh batch. Approval permits an explanation
only. No plan step is executed; the expiring process-local decision store supplies
neither production authentication nor durable recovery.

Each framework has MP4/WebM, a poster, result screenshot, measured VTT captions,
and a text walkthrough. SDK observations and application form drafts are captured
separately for inert replay. The deterministic suite covers denial/cancellation,
rollback, pre-acknowledgement retry and post-acknowledgement recovery boundaries.
Legacy workflow recordings remain for bookmarks and independent fixture tests.

Run `WORKBENCH_LESSONS=shared-state,activities,interrupts npx nx workbench-demo www`
with server-only OpenAI credentials/model. Filming-only 20 ms event pacing and
half-speed footage are disclosed. Preserve unique masters and phase reports in
ignored `dist/docs-workbench/captures/<run-id>`. No SDK release or new dependencies.


The shared state, activities and interrupt/resume recordings were refreshed after
the canonical shell redesign. They use the collapsible sidebar, resizable chat
and paired inspector, with the icon player below. Earlier batch notes describe the original captures; the canonical media now
matches the redesigned shell, including these six workflow recordings.

## Canonical message history and browser-saved text

The active Message history and Save text conversations guides use four separate
Angular/React recordings: `canonical-workbench-{message-history,save-text-conversations}-{react,angular}`.
The first makes two actual provider requests around explicit keep/clear/restore.
The second makes three across independent runtimes, two saved slots, hard refresh
and explicit load. The new trace starts after refresh; old requests are not
reconstructed. Only successful completed text is saved, with version, role, size
and lifecycle checks. Text does not recover canonical agent checkpoints.

All nineteen workbench lessons have two framework paths (38 total). The new four
recordings have both codecs, captions, poster, result and walkthrough. Actual
OpenAI events are paced unchanged for filming and footage runs at half speed.
Replay is inert. Legacy persistence assets and standalone fixture clients remain
for bookmarks and independent tests. Originals/reports stay in unique ignored
capture directories. No SDK release.


## Canonical server-owned threads and public endpoints

Updated 2026-10-27. The Angular and React `recipes/threads` and
`recipes/public-endpoint` guides use separate
`canonical-workbench-{server-threads,public-endpoint}-{angular,react}` recordings.
Actual Hashbrown text chat streams real OpenAI output. Session, load and save
requests use the checked server routes; denials happen before provider work.

Threads shows explicit save, hard refresh, text restoration under the same server
thread identity, and a follow-up with a fresh run ID. An independent ordinary PUT
advances the repository version; a stale save genuinely returns 409 and preserves
unsaved SDK text until explicit reload. Only successful completed bounded text is
saved. This is not an agent checkpoint.

Access shows an anonymous 401, an authorized model request and a foreign-owner
404. The local demo session is server-minted; the process-memory repository is
isolated per session. These integrations demonstrate boundaries and are not
production authentication or durable storage. No credentials appear in captures.

All twenty-one lessons have two framework paths (42 total). Each new recording
has MP4/WebM, measured captions, poster, result and an honest walkthrough.
Unchanged provider events are paced 20 ms for filming and footage is half speed.
Replay is inert. Preserve legacy examples/media for independent fixtures and
bookmarks. Unique ignored capture directories retain masters and reports.
No SDK release.


## Canonical agent decisions, JSON parsing and natural forms

Updated 2026-10-27. The six Angular/React recipes use separate
`canonical-workbench-{agent-decisions,json-parser,natural-forms}-{angular,react}`
recordings. Agent decisions call real TypeSafe on the server, validate a closed
route at confidence >=0.75 and invoke fixed read-only application handlers.
Decisions arrive whole; handler text is not model-generated prose.

Parser and forms use actual Hashbrown text chat and direct framework parsers over
OpenAI JSON. Partial values, source completion, parser completion, original JSON
validation and application rules are separate. Forms copies a fresh valid draft
for review, preserves editable controls, and applies validated fields explicitly
against the current source/turn/revision. Its actual readContext tool supplies the
applied plan to the follow-up. Parser and agent lessons preserve application state.

All twenty-four lessons have two framework paths (48 total). Each new ID has both
codecs, measured captions, poster/result and a truthful walkthrough. Unchanged
protocol event pacing and half-speed footage are disclosed. Replay performs no
requests or writes. Unique ignored capture directories retain masters/reports.
Keep legacy assets and standalone fixtures for old bookmarks. No SDK release.
