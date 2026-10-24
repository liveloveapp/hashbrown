# Documentation media inventory

Updated 2026-10-24. Paths are below `/docs/<sdk>/`; React and Angular share a recording when the visible behavior is the same. Verify both SDK implementations before sharing a capture. This is a production backlog, not a claim that every guide has a recording.

## Current recordings

| Recording     | Source                                                                                     | Pages                                         | Notes                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Welcome card  | `www/examples/quickstart/{react,angular}`                                                  | Introduction, Quickstart, How Hashbrown works | Real client rendering; deterministic AG-UI output; presentation CSS added in recorder            |
| Conversation  | `www/examples/quickstart/{react,angular}`                                                  | Messages and turns, System instructions       | Name and follow-up in the same instance; does not demonstrate persistence                        |
| Persistence   | `SavedConversations.tsx` / `saved-conversations.ts` and each framework’s `text-history.ts` | Message history, Browser history              | Completed text only; refresh, two independent selections, and a follow-up using restored history |
| Interrupts    | `www/examples/quickstart/{react,angular}`                                                  | Interrupt and resume                          | Two-answer approval batch followed by the resumed result                                         |
| Shared state  | `www/examples/quickstart/{react,angular}`                                                  | Shared agent state                            | Local destination edit sent to the agent; streamed agent update shown in the app                 |
| Activities    | `www/examples/quickstart/{react,angular}`                                                  | Activities                                    | Itinerary progress reaches completion                                                            |
| UI kits       | `www/examples/quickstart/{react,angular}`                                                  | UI kits                                       | Select and render two trusted component types from one reusable kit                              |
| Generative UI | `examples/atc`                                                                             | Exposing components                           | Trusted ATC components                                                                           |
| Streaming     | `examples/atc`                                                                             | Earlier ATC capture; retained asset           | Incremental ATC response                                                                         |
| Browser tools | `examples/atc`                                                                             | Tool calling                                  | Fixture traffic read through tools                                                               |
| Schemas       | `examples/atc`                                                                             | Skillet schemas                               | Typed flight filter                                                                              |
| Decisions     | `examples/atc`                                                                             | Decisions                                     | Intent routing and component narrowing                                                           |
| Debugging     | `examples/atc`                                                                             | Debugging                                     | ATC-specific inspector, separate from Redux DevTools                                             |

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

`concept/schema`, `concept/structured-output`, `concept/streaming`, and the natural-language recipe now form one sequence. The schema page retains the ATC filter recording as a second use case and introduces the smaller checked list used by subsequent pages. The earlier ATC streaming asset remains available, but the Streaming guide now uses its own list interaction.

## Assisted interface recordings

Three task-based recipes use the checked clients in `www/examples/quickstart` and shared helpers in `runtime`. Both SDKs are exercised before React supplies the shared recordings. All three include MP4/WebM, a poster, captions, a text walkthrough and a result screenshot.

| Recording ID             | Pages                        | Recorded interaction                                                                                                          |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `magic-text`             | `recipes/magic-text`         | Stream a Markdown packing reply, then select a resolved citation to open application-owned source details without navigation. |
| `predictive-suggestions` | `recipes/predictive-actions` | Request a context-bound packing proposal, accept Passport and dismiss Phone charger without another completion request.       |
| `ui-selection`           | `recipes/ui-selection`       | Choose between a shopping summary and item list while keeping the item names and quantities in application code.              |

Magic Text and suggestions use scripted AG-UI responses; UI selection uses scripted decision responses. These are real client interactions with added presentation CSS, no narration or live model calls. The packing list is component-local state. A source citation does not establish factual correctness, and decision confidence is not a calibrated measure of usefulness. The checked `server/selection-server.ts` pins the selection questions for real TypeSafe requests; the recorder substitutes responses without requiring credentials.

## Remaining production work

Record the uncovered tasks listed below using each guide's own interaction. Each recording needs a deterministic fixture, an example owner, a visible success result, and a written guide that stands on its own. Reuse installed recording tools; no new hosting dependency.

## Page coverage

| Page                                          | Status                | Recording or remaining work                                                                                      |
| --------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `concept/activities`                          | Recorded              | activities                                                                                                       |
| `concept/ai-basics`                           | Recorded              | conversation                                                                                                     |
| `concept/components`                          | Recorded              | generative-ui                                                                                                    |
| `concept/debugging`                           | Recorded              | debugging                                                                                                        |
| `concept/decisions`                           | Recorded              | decisions                                                                                                        |
| `concept/functions`                           | Recorded              | browser-tools                                                                                                    |
| `concept/interrupt-and-resume`                | Recorded              | interrupts                                                                                                       |
| `concept/message-history`                     | Recorded              | persistence; completed text only                                                                                 |
| `concept/runtime`                             | Recorded              | javascript-runtime; real QuickJS calculation, errors, and recovery.                                              |
| `concept/schema`                              | Recorded              | schemas                                                                                                          |
| `concept/shared-agent-state`                  | Recorded              | shared-state                                                                                                     |
| `concept/streaming`                           | Recorded              | streaming-data                                                                                                   |
| `concept/structured-output`                   | Recorded              | structured-form                                                                                                  |
| `concept/system-instructions`                 | Recorded              | conversation                                                                                                     |
| `concept/transform-request-options`           | Recorded              | request-transformation; actual adapter, trusted workspace context and scripted provider-native HTTP output. |
| `guide/choosing-model`                        | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                           |
| `guide/ethics`                                | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                           |
| `guide/prompt-engineering`                    | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                           |
| `migrations/v0-5`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                |
| `migrations/v0-6`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                |
| `migrations/v0-7`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                |
| `migrations/threadplane` | Intentional exception | Framework-specific presentation/runtime changes and migration boundaries are easier to scan as steps. |
| `migrations/v0-8`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                                |
| `platform/anthropic`                          | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/azure`                              | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/bedrock`                            | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/custom`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/dotnet`                             | Intentional exception | Server hosting and provider configuration belong in named, copyable files; conformance verifies the integration. |
| `platform/google`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/ollama`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/openai`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `platform/typesafe`                           | Intentional exception | Credentials and host configuration belong in named, copyable files.                                              |
| `recipes/browser-history`                     | Recorded              | persistence; application-owned versioned browser storage of completed text.                                      |
| `recipes/decisions-in-agents`                 | Recorded              | agent-routing and agent-fallback; checked server routing, clarification, failure and explicit retry.              |
| `recipes/json-parser`                         | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot.           |
| `recipes/local-models`                        | Recorded              | local-models; real Chrome inference extracts a typed trip brief after explicit preparation.                      |
| `recipes/magic-text`                          | Recorded              | magic-text; streaming Markdown and source details.                                                               |
| `recipes/natural-language-to-structured-data` | Recorded              | structured-form; generate a typed draft, validate, review, and explicitly apply.                                 |
| `recipes/predictive-actions`                  | Recorded              | predictive-suggestions; complete context-bound offers with explicit Accept and Dismiss.                          |
| `recipes/public-endpoint`                     | Recorded              | public-endpoint; session and owner checks before scripted provider streaming.                                    |
| `recipes/threadplane`                         | Needs recording       | Source-grounded integration guides; no Threadplane recording is claimed.                                        |
| `recipes/threads`                             | Recorded              | server-threads; server-owned completed text, version conflict, and explicit reload.                              |
| `recipes/ui-chatbot`                          | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot.           |
| `recipes/ui-kits`                             | Recorded              | ui-kits                                                                                                          |
| `recipes/ui-selection`                        | Recorded              | ui-selection; app-owned summary/list views and manual fallback.                                                  |
| `start/how-it-works`                          | Recorded              | welcome-card; follows the same component through the request path                                                |
| `start/intro`                                 | Recorded              | welcome-card                                                                                                     |
| `start/overview`                              | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot.           |
| `start/platforms`                             | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot.           |
| `start/quick`                                 | Recorded              | welcome-card                                                                                                     |
| `start/sample`                                | Recorded              | Existing `www-atc-demo-video` player; full ATC interaction.                                                      |

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

The Angular guide uses Threadplane’s full chat with its AG-UI adapter. The React guide composes its source-workspace transcript and input with Hashbrown execution. Migration guides keep authentication, authorization, system policy, history, tools and component contracts explicit. These guides do not claim a Threadplane recording. CopilotKit recipe HTML and Markdown bookmarks redirect to the React Threadplane guide.

## Server request transformation

Run `npx nx docs-request-transform-demo www` sequentially with other recorders. `DOCS_SKIP_RECORDING=1` verifies without replacing media; `DOCS_DEMO_MODES=request-transformation` selects its sole mode and unknown values fail. The ten-second recording runs the checked React client, Express endpoint, asynchronous transform and actual OpenAI adapter. Only identity/context integrations and provider-native Responses output are scripted locally. Angular passes the same interaction checks before React is captured.

Checks cover trusted instructions at the actual provider boundary, forged browser policy isolation, identity/authorization/context failures, provider failure and truncation, cancellation before and during provider work, stale-run isolation, explicit recovery, no automatic request, mobile overflow and both video formats. Unit tests additionally preserve populated provider tools/schema/store/include/reasoning without mutation. Six public assets include the measured captions, walkthrough and 920×522 result frame; captures/masters/reports stay in ignored `dist/docs-request-transform`.
