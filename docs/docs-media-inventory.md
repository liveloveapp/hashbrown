# Documentation media inventory

Updated 2026-10-23. Paths are below `/docs/<sdk>/`; React and Angular share a recording when the visible behavior is the same. React-only CopilotKit is listed separately in the source navigation. Verify both SDK implementations before sharing a capture. This is a production backlog, not a claim that every guide has a recording.

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
| Streaming     | `examples/atc`                                                                             | Streaming                                     | Incremental ATC response                                                                         |
| Browser tools | `examples/atc`                                                                             | Tool calling                                  | Fixture traffic read through tools                                                               |
| Schemas       | `examples/atc`                                                                             | Skillet schemas, Structured output            | Typed flight filter                                                                              |
| Decisions     | `examples/atc`                                                                             | Decisions                                     | Intent routing and component narrowing                                                           |
| Debugging     | `examples/atc`                                                                             | Debugging                                     | ATC-specific inspector, separate from Redux DevTools                                             |

All recordings have MP4, WebM, a poster, captions, and a text walkthrough under `www/public/video/docs`. Welcome card, conversation, and the five workflow recordings have result screenshots. ATC captures disclose fixture traffic and scripted responses. Tutorial captures disclose scripted AG-UI responses and use the checked client example files. The workflow recorder verifies both frameworks and records their shared visible behavior from React.

The persistence capture demonstrates application-owned, versioned browser storage of completed text messages. It does not save canonical agent checkpoints, tools, generated UI, shared state, or pending interrupts. The separate server-thread example below covers server-owned completed text with optimistic version checks; neither example restores canonical agent checkpoints.

## Production and runtime recordings

These three recordings use checked examples and existing guide pages. Both frameworks, final encodes, posters, captions, walkthroughs, and result frames have been verified.

| Recording ID         | Checked source                                                                                                        | Pages                     | Recorded interaction                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-endpoint`    | `server/thread-app.ts`, `server/thread-server.ts`; recorder access fixture                                            | `recipes/public-endpoint` | Reject an unauthenticated run, accept a local fixture session, stream a reply, and reject a foreign owner's thread.                            |
| `server-threads`     | `ServerConversations.tsx` / `server-conversations.ts`, each framework's `server-history.ts`, `server/thread-store.ts` | `recipes/threads`         | Load saved text before chat creation, save a completed turn, refresh, switch conversations, surface a version conflict, and explicitly reload. |
| `javascript-runtime` | `RuntimeDemo.tsx` / `runtime-demo.ts`, `runtime/basket.ts`                                                            | `concept/runtime`         | Run a prewritten basket calculation in real QuickJS, fail browser access and invalid host arguments, then calculate successfully again.        |

The endpoint and thread recordings use opaque local fixture sessions, an in-memory repository, and scripted provider events. They do not demonstrate a deployed login service, durable database, or live model response. `createProductionThreadApp` in `server/thread-server.ts` supplies the real OpenAI stream adapter and fixes the model/output policy on the server; the application must inject its verified identity, atomic database store, and shared admission control. The fixture integrations remain recorder-only.

The runtime recording submits visible prewritten scripts to real QuickJS through the public framework APIs. Its basket host handler validates arguments explicitly; runtime schemas describe the contract and do not automatically validate the bridge's inputs or results. Host handlers execute outside QuickJS with host privileges. No model or provider key is needed for the direct runtime example.

## Remaining production work

Record the uncovered tasks listed below using each guide's own interaction. Each recording needs a deterministic fixture, an example owner, a visible success result, and a written guide that stands on its own. Reuse installed recording tools; no new hosting dependency.

## Page coverage

| Page                                          | Status                | Recording or remaining work                                                                            |
| --------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `concept/activities`                          | Recorded              | activities                                                                                             |
| `concept/ai-basics`                           | Recorded              | conversation                                                                                           |
| `concept/components`                          | Recorded              | generative-ui                                                                                          |
| `concept/debugging`                           | Recorded              | debugging                                                                                              |
| `concept/decisions`                           | Recorded              | decisions                                                                                              |
| `concept/functions`                           | Recorded              | browser-tools                                                                                          |
| `concept/interrupt-and-resume`                | Recorded              | interrupts                                                                                             |
| `concept/message-history`                     | Recorded              | persistence; completed text only                                                                       |
| `concept/runtime`                             | Recorded  | javascript-runtime; real QuickJS calculation, errors, and recovery.                                    |
| `concept/schema`                              | Recorded              | schemas                                                                                                |
| `concept/shared-agent-state`                  | Recorded              | shared-state                                                                                           |
| `concept/streaming`                           | Recorded              | streaming                                                                                              |
| `concept/structured-output`                   | Recorded              | schemas                                                                                                |
| `concept/system-instructions`                 | Recorded              | conversation                                                                                           |
| `concept/transform-request-options`           | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `guide/choosing-model`                        | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                 |
| `guide/ethics`                                | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                 |
| `guide/prompt-engineering`                    | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction.                                 |
| `migrations/v0-5`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                      |
| `migrations/v0-6`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                      |
| `migrations/v0-7`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                      |
| `migrations/v0-8`                             | Intentional exception | Version-specific changes are easier to scan as before/after code.                                      |
| `platform/anthropic`                          | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/azure`                              | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/bedrock`                            | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/custom`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/google`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/ollama`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/openai`                             | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `platform/typesafe`                           | Intentional exception | Credentials and host configuration belong in named, copyable files.                                    |
| `recipes/browser-history`                     | Recorded              | persistence; application-owned versioned browser storage of completed text.                            |
| `recipes/copilotkit`                          | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/decisions-in-agents`                 | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/json-parser`                         | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/local-models`                        | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/magic-text`                          | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/natural-language-to-structured-data` | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/predictive-actions`                  | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/public-endpoint`                     | Recorded  | public-endpoint; session and owner checks before scripted provider streaming.                          |
| `recipes/remote-mcp`                          | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/threads`                             | Recorded  | server-threads; server-owned completed text, version conflict, and explicit reload.                    |
| `recipes/ui-chatbot`                          | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/ui-kits`                             | Recorded              | ui-kits                                                                                                |
| `recipes/ui-selection`                        | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/how-it-works`                          | Recorded              | welcome-card; follows the same component through the request path                                      |
| `start/intro`                                 | Recorded              | welcome-card                                                                                           |
| `start/overview`                              | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/platforms`                             | Needs recording       | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/quick`                                 | Recorded              | welcome-card                                                                                           |
| `start/sample`                                | Recorded              | Existing `www-atc-demo-video` player; full ATC interaction.                                            |

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
