# Documentation examples

These are the complete files used in the React and Angular Quickstarts, conversation and workflow guides, Public endpoint, Threads, and JS Runtime. Guide tests compare published code blocks with checked files. `npx nx typecheck www` checks React/server types and Angular strict templates against the built packages.

`server/server.ts` is the Quickstart's local development endpoint. Provider credentials stay in its `.env` file, and frontend configuration demonstrates a same-origin proxy. The authenticated server pattern is composed separately through `createThreadApp` in `server/thread-app.ts` and the real OpenAI adapter `createProductionThreadApp` in `server/thread-server.ts`.

The production adapter keeps its API key, model, and output cap on the server. Supply the application's real identity/session verifier, atomic database repository, and shared admission control through dependency injection. The in-memory store in `server/thread-store.ts` is a local example, and recorder-issued sessions are local fixtures. Neither supplies deployed identity, durable storage, or distributed admission limits.

The recorders verify both frameworks and record shared visible behavior from React. They use checked client files with scripted AG-UI output; the runtime example instead executes visible prewritten scripts in real QuickJS. Recorder frame and presentation styles have no stylesheet requirement in tutorial components. No recorder needs a provider key.

## Check and record

Run through Nx:

```sh
npx nx typecheck www
npx nx docs-demo www
npx nx docs-workflows-demo www
npx nx docs-production-demo www
npx nx docs-recipes-demo www
```

Run these sequentially. All recording targets use `dist/docs-quickstart/compiled`, so concurrent runs can overwrite compiled entry points. Recording requires installed Playwright Chromium, ffmpeg, and ffprobe.

`docs-demo` covers the welcome card and text conversation. Its captures, masters, browser build, and verification reports go to ignored `dist/docs-quickstart`.

`docs-workflows-demo` covers five modes:

| Mode           | Checked interaction                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `persistence`  | Save completed text, refresh without starting a run, switch between two conversations, and send restored history in a follow-up. |
| `interrupts`   | Display two approval questions and submit the complete batch before showing the resumed result.                                  |
| `shared-state` | Edit a destination, inspect it in the run input, and render the agent's state update.                                            |
| `activities`   | Show itinerary progress from zero through completion.                                                                            |
| `ui-kits`      | Generate a welcome card and a status card from one reusable component kit.                                                       |

The workflow recorder writes captures, masters, static browser assets, and `verification.json` to ignored `dist/docs-workflows`. The persistence mode uses `SavedConversations.tsx` / `saved-conversations.ts` and the framework-specific `text-history.ts` files. It covers Message history and the Browser history recipe.

`docs-production-demo` adds three modes. Their captures and browser recovery checks have been verified:

| Mode / recording ID  | Checked interaction                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public-endpoint`    | Reject an unauthenticated run, establish a local fixture session, stream a scripted response, and reject another owner's thread.                      |
| `server-threads`     | Load server-owned text before chat creation, save a completed turn, refresh, switch conversations, surface a version conflict, and explicitly reload. |
| `javascript-runtime` | Execute the basket calculation in QuickJS, display browser-global and invalid-argument failures, and successfully retry.                              |

The production recorder writes captures, masters, static browser assets, result frames, and `verification.json` to ignored `dist/docs-production`. Endpoint and thread modes use opaque recorder-issued local sessions, an in-memory store, and scripted provider events. These fixtures exercise the checked HTTP routes without a live model or deployed login service. The runtime mode uses the real public React/Angular runtime APIs, a read-only basket host function, and prewritten scripts; the arithmetic runs inside QuickJS.

Final MP4/WebM files, posters, result screenshots, captions, and text walkthroughs belong in `www/public/video/docs`. Review them whenever the interaction changes, and inspect the final verification report before treating a recording as ready to publish.

## Skip capture or select modes

To verify browser interactions without replacing published media:

```sh
DOCS_SKIP_RECORDING=1 npx nx docs-workflows-demo www
DOCS_SKIP_RECORDING=1 npx nx docs-production-demo www
```

Select a comma-separated list without spaces from the modes supported by that target:

```sh
DOCS_DEMO_MODES=persistence,interrupts npx nx docs-workflows-demo www
DOCS_DEMO_MODES=server-threads,javascript-runtime npx nx docs-production-demo www
```

Unknown names fail immediately. `DOCS_SKIP_RECORDING` and `DOCS_DEMO_MODES` can be combined. Production and workflow mode names are separate sets.

## Check failure behavior

The workflow recorder checks malformed saved-history preservation, disabled sending until explicit clearing, and storage quota failure for both SDKs. These storage checks run even when `persistence` is omitted. When `shared-state` is selected, it injects `RUN_ERROR` after a state snapshot and confirms rollback to the committed destination and status.

When `server-threads` is selected, the production recorder checks saves in progress, failed saves, version conflicts, explicit reload, and stale loads after conversation selection. When `javascript-runtime` is selected, it checks fresh context creation, interruption of an infinite loop, and successful recovery. Unexpected page errors fail the main interaction checks. The runtime host handler validates untrusted arguments explicitly: its schemas describe the function contract but do not automatically validate arguments or results across the bridge. Host handlers retain host privileges outside QuickJS.

HTTP and repository unit tests cover identity and ownership checks, request limits, server-owned provider input, admission, stream failures, immutable snapshots, and atomic version conflicts. Text-history and server-history tests cover their respective transport/storage formats and failures.

Both persistence examples store supported completed text only. They do not persist canonical agent checkpoints, generated UI, tool history, shared state, or pending interrupt ownership. A thread ID does not restore history or authorize access by itself. Durable interrupted-workflow recovery remains separate application work.

## Typed lists and forms

`react/src/StructuredList.tsx` and `angular/src/app/structured-list.ts` use the shared `runtime/shopping-list.ts` schema and validator. Generate creates an independent draft conversation. Apply requires a fresh, settled, valid result and explicit user action; cancelled, failed, truncated and stale drafts never replace the applied list. Applied values live only in component state.

Run `npx nx docs-structured-demo www` for both SDK checks and the `structured-form` / `streaming-data` recordings, or set `DOCS_SKIP_RECORDING=1`. `DOCS_DEMO_MODES` selects these target-specific IDs. The recorder uses scripted AG-UI events and added presentation CSS, no provider key or backend write. Captures and verification reports go to ignored `dist/docs-structured`; do not run recording targets concurrently because they share compiled output.

## Assisted interface recipes

`MagicTextDemo.tsx` / `magic-text-demo.ts` render the latest assistant string through Magic Text and open citation details without navigation. The parser finalizes when the stream ends, including a stop or error; that state alone does not establish a successful answer.

`PredictiveSuggestions.tsx` / `predictive-suggestions.ts` use independent structured completions. `runtime/predictions.ts` checks a fresh context ID, settled runtime and bounded catalog/reasons before offering explicit Accept/Dismiss actions. Those actions update local state without changing the completion input. Refresh clears accepted items.

`UiSelection.tsx` / `ui-selection.ts` select app-owned summary/list views with app-owned props and a manual fallback. `runtime/selection.ts` shares candidate metadata with `server/selection-server.ts`, which pins questions for the real TypeSafe route. That standalone local server requires server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` and listens on port 3001 instead of the separate Quickstart server. The docs show the `/api/decide` proxy/provider configuration. The recorder substitutes decision responses; it does not call TypeSafe.

Run `npx nx docs-recipes-demo www` for the `magic-text`, `predictive-suggestions` and `ui-selection` modes. `DOCS_SKIP_RECORDING=1` and `DOCS_DEMO_MODES` work as in the other targets. Static builds, original captures, masters and verification reports stay in ignored `dist/docs-recipes`. Both SDKs are checked before the React capture. All examples use the installed dependencies; no provider key is needed to record. See `docs/docs-media-inventory.md` for coverage and remaining work.

## Decisions in Agents

`AgentDecisions.tsx` / `agent-decisions.ts` send explicit independent support requests to `/api/agent`. The checked `server/agent-routing.ts`, `agent-app.ts` and `agent-server.ts` pin a TypeSafe schema, validate input and order IDs, and use fixed read-only order/returns handlers. Server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` configure the real local endpoint. Hosted customer access requires application identity, ownership, authorization and request controls.

Run `npx nx docs-agent-decisions-demo www` for both SDK checks and the `agent-routing` / `agent-fallback` recordings. The recorder injects only classifier envelopes and failures into the checked Express app; final replies come from the checked router. Both frameworks pass before React supplies the shared recordings. Presentation styles are added; no provider key, live model or narration is used. Each recording has MP4/WebM, a poster, captions, a walkthrough and result screenshot.

`DOCS_SKIP_RECORDING=1` verifies without replacing media; `DOCS_DEMO_MODES` selects these target-specific IDs and rejects unknown modes. Captures, masters, static builds and reports stay in ignored `dist/docs-agent-decisions`. Run sequentially with the other recorders, which share compiled output. Review final frames and `verification.json` after capture.

## Browser-native trip briefs

`runtime/local-models.ts`, `LocalModels.tsx` and `local-models.ts` provide explicit Prepare model / Generate locally / Cancel actions around the real `experimental_chrome` transport. The small schema extracts a destination and day count; only a fresh, successful, complete, bounded response becomes a ready preview. Preparation owns and destroys its temporary download session, including late cancellation. Generation owns separate transport sessions and rejects implicit downloads. No backend, API key, hosted fallback or new dependency is needed.

Run `npx nx docs-local-models-demo www` locally with an already available native Chrome model in the dedicated test profile. The recorder runs deterministic native-API contract checks in both clients, then real native inference in both frameworks before recording React. It never downloads weights. Mobile checks use the shim for layout/contracts, not native inference. `DOCS_SKIP_RECORDING=1` verifies without replacing assets; `DOCS_DEMO_MODES=local-models` selects the sole supported ID. Captures, masters, static builds and reports stay in ignored `dist/docs-local-models`. Run sequentially with other recorders and GPU suites.
