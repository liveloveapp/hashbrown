# Documentation examples

## Canonical conversation workbench

The checked React `Workbench.tsx` and Angular `workbench.ts` are the shared documentation demo. Both use real Hashbrown UI chat, the `readContext` browser tool, a trusted streaming `SummaryCard`, and explicit revision-checked plan acceptance. The LLA shell is shared; SDK rendering stays framework-owned.

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment, then run:

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/react.html` or `/angular.html`. The loopback server pins the system instruction, tool catalog, native UI response schema and output limit. It keeps credentials server-side. This development host is separate from the public website and does not expose an unrestricted hosted model endpoint.

The bottom player captures actual requests, decoded AG-UI events, tool results, SDK-resolved props, completion and application snapshots. Playback reads those immutable frames; it never calls a tool, contacts the server or accepts a plan. Conversation sessions retain their own SDK history and application state in memory. Hiding a session cancels active generation and pauses playback. Refresh clears sessions.

```sh
npx nx workbench-build www
npx nx workbench-e2e www
WORKBENCH_LIVE=1 npx nx workbench-e2e www
```

The default browser check runs both real SDKs against explicitly labelled deterministic HTTP fixtures. Live mode requires the server credentials and model and uses the actual OpenAI adapter. The workbench displays `Test fixture` or `Live model` from the response header; reports and screenshots go to ignored `dist/docs-workbench/verification`. `WORKBENCH_RECORD=1` also captures browser video. A fixture recording must retain its fixture label.

`workbench-build` strictly compiles both framework sources, builds browser assets and bundles the Node server and verifier. The normal docs route-report target also runs the deterministic workbench checks. It never needs provider credentials in CI. Run recording/build targets sequentially because the checked examples share `dist/docs-quickstart/compiled`.

The earlier guide-specific examples below remain useful focused tutorials. New recordings should use this workbench so prompts, requests, partial output, rendered views and application changes share one teaching surface.

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

## Streaming JSON parser

`npx nx docs-parser-demo www` compiles the checked examples and verifies both real
framework clients before making separate `json-parser-react` and
`json-parser-angular` recordings. Use `DOCS_SKIP_RECORDING=1` to verify without
replacing public assets, and `DOCS_DEMO_MODES=json-parser-react,json-parser-angular`
to select captures. Unknown names fail before assets change. Both clients are
verified even when only one recording is selected.

The source is finite local JSON supplied by an owned timer. No weather service,
provider key, or model is used. Checks cover ordinary versus streaming strings,
required item field values before their closing brace, trailing garbage after a valid-looking preview, invalid
schema values, truncation, missing streaming fields, wrong field types, Stop,
Reset, midstream preset changes, replacement, unmount, and mobile layout. Final
success requires source EOF, parser completion and validation of the complete
original JSON; partial typed values are previews.

Each run preserves its build, raw captures, measured frames, phase timestamps,
masters and verification report under a unique ignored `dist/docs-parser` folder.
The public media include MP4/WebM, poster, result screenshot, captions and a
framework-specific text walkthrough. Run sequentially with other recorders that
share `dist/docs-quickstart/compiled`.

## Generative UI chatbot

`LightChatbot.tsx` / `light-chatbot.ts` use `runtime/light-chatbot.ts` for a
simulated Desk light. The real browser tool reads its current brightness. A
trusted proposal component waits for successful completion and an explicit
Apply action; a follow-up reads the updated state. Changes remain in browser
memory and reset on refresh. No real device is controlled.

Run `npx nx docs-ui-chatbot-demo www` to verify both actual clients, then record
separate `ui-chatbot-react` and `ui-chatbot-angular` demos. The HTTP fixture emits
AG-UI tool calls, checks the real handler's canonical result, and supplies the
trusted UI response. No live model or provider key is needed to record.

`DOCS_SKIP_RECORDING=1` runs browser checks without replacing media.
`DOCS_DEMO_MODES` selects these target-specific capture IDs; both clients are
verified first. Checks include invalid values, failed and incomplete runs,
streaming-time Apply, repeats, revision changes, newer requests, cancellation,
overlapping late delivery, keyboard operation, unmount, and mobile layout.
Unique ignored `dist/docs-ui-chatbot` directories preserve browser builds,
requests, raw captures, masters, measured phases, and verification reports.
Run sequentially with other recorders that share compiled output.

## Canonical workbench lessons

The workbench now has twenty-four allowlisted lessons in both framework hosts:

- `?lesson=generative-ui`: real UI-chat, trusted SummaryCard, streamed props.
- `?lesson=tools`: the same conversation, initially focused on requests and readContext.
- `?lesson=structured-output`: real structured-chat, plain title/steps data, application-owned rendering.
- `?lesson=streaming`: partial title text and resolved step values.
- `?lesson=schemas`: exact response contract and preview validation.
- `?lesson=decisions`: complete typed next-action choices and confidence.
- `?lesson=debugging`: deliberate local HTTP 403, same-conversation retry, captured response evidence.
- `?lesson=request-transformation`: actual mapped provider options, public workspace policy, and sanitized callback traces.
- `?lesson=magic-text`: streaming Markdown and actual citation inspection.
- `?lesson=predictions`: fresh context snapshots, catalogue proposals, explicit acceptance/dismissal.
- `?lesson=ui-selection`: whole candidate decisions, app-owned views and manual control.
- `?lesson=first-plan`: one tool-free UI request and a trusted preview, without an application write.
- `?lesson=conversation`: two plain-text turns, retained messages, and request identities.
- `?lesson=system-instructions`: browser declaration and public server policy observed at provider mapping.
- `?lesson=shared-state`: explicit state replacement and actual agent state updates.
- `?lesson=activities`: actual agent progress with SDK links and fresh activity IDs.
- `?lesson=interrupts`: whole approval batches and same-turn resume.
- `?lesson=message-history`: keep completed text, clear/restore actual SDK messages, inspect follow-up context.
- `?lesson=save-text-conversations`: explicit two-slot saves, refresh, load validated text into a new runtime.

The sidebar collapses, the chat and inspector resize, and the inspector pairs each captured frame with what the SDK or app made of it. The player shows compact milestones; Raw events puts every frame on the scrubber. Selecting a lesson navigates to a fresh page without sending a model request. Existing conversations remain in memory only within their current page.

Run `npx nx workbench-demo www` with server-only `OPENAI_API_KEY` and `OPENAI_MODEL` to verify and record the selected paths, encode MP4/WebM with ffmpeg, and publish local media, posters, result screenshots, measured captions and transcripts. It refuses to publish fixture footage. `WORKBENCH_LESSONS=generative-ui,tools,structured-output` optionally selects a subset and rejects unknown values. Run sequentially with other compilation/recording targets. Footage uses half-speed timing for readable streaming; reports include captured phase times and provider provenance. Each recording run preserves its original captures and report under a unique `dist/docs-workbench/captures/<run-id>` directory. The Generative UI recording also refreshes the workbench overview media.

## Streaming, schemas and decisions in the workbench

`?lesson=streaming` selects the shared schema with a streaming title and array.
`?lesson=schemas` opens the exact selected contract in Schema, with preview
validation kept separate from completion and explicit acceptance.
`?lesson=decisions` mounts actual `useDecision` / `decisionResource` clients.
The application supplies a fixed plan; TypeSafe selects record/review/clarify.
A completed fresh choice at confidence >=0.75 can be explicitly used. Low
confidence, errors and cancellation preserve state and offer manual review.
Decision responses arrive as whole JSON, not generated streaming text.

The decision route additionally needs server-only `TYPESAFE_API_KEY` and
`TYPESAFE_MODEL` (the recordings pin `jev-1.14.0`). Missing decision credentials
return 503 without preventing the OpenAI lessons from running. The server fixes
the plan, system policy, schema and question options, bounds prompts/revisions,
and propagates cancellation.

Use `WORKBENCH_LESSONS=streaming,schemas,decisions npx nx workbench-demo www` to
record this batch with both providers configured. The recorder verifies partial
visible title text, completed-only acceptance, exact plan revision semantics,
typed decisions/confidence, explicit selection and inert synchronized replay.
Decision media require TypeSafe provider provenance and have separate captions
that never describe decisions as streaming. Existing recordings are preserved
unless selected. Each capture/report lives in a unique ignored run directory.

Recording presentation: the new OpenAI streaming/schema captures pace unchanged provider events at 20 ms so browser batching does not hide previews. This is disclosed in the media notes and walkthroughs. The normal demo host adds no delay; complete TypeSafe decisions are not paced as streams.

## Debugging and request transformation in the workbench

`?lesson=debugging` starts with the local **Deny requests for this demo** switch
enabled. Its HTTP 403 happens before provider invocation, has `demo-failure`
provenance, and does not model authentication. Clear the switch and resend in the
same conversation to recover through the real UI-chat SDK. Captured HTTP status,
URL, source and fixed public denial detail remain available when replay selects
the failed turn. Changing the switch does not request or write application state.

`?lesson=request-transformation` opens Transform. The shared OpenAI adapter
callback observes actual mapped options and appends fixed public workspace
instructions. A sanitized `workbench.request-transformation` custom event records
before/after fields and preservation checks. Input messages, headers and keys
are omitted. Required context failures fail closed; stop/disposal closes the
underlying provider iterator. Neither transformation nor replay accepts a plan.

Use `WORKBENCH_LESSONS=debugging,request-transformation npx nx workbench-demo www`
with server-only OpenAI credentials to record this batch. Each framework has its
own recording, captions, transcript, poster and result screenshot. The debugging
walkthrough identifies its intentional local failure separately from successful
provider turns. Unchanged OpenAI events are paced for filming and footage uses
half-speed timing; the normal host adds no delay. Reports and originals remain
in each unique ignored capture directory.

### Canonical recipe lessons

The same workbench also hosts three recipe lessons in each framework:

| Lesson                 | Query                  | Actual API and boundary                                                                                    |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Magic Text             | `?lesson=magic-text`   | Text chat and the real SDK Markdown renderer; reference inspection does not change the plan.               |
| Predictive suggestions | `?lesson=predictions`  | Structured completion for a fresh context snapshot; only explicit acceptance applies a known action.       |
| UI selection           | `?lesson=ui-selection` | UI decision candidates over TypeSafe; app-owned views and props, confidence threshold and manual fallback. |

Run `WORKBENCH_LESSONS=magic-text,predictions,ui-selection npx nx workbench-demo www`
with both providers' existing server credentials and exact model settings.
The recorder uses separate real Angular and React captures. OpenAI text and
completion events may be paced only for filming; TypeSafe decisions arrive whole.
Replay reads immutable frames, never repeats a request or action, and disables
handlers while rendering the captured Markdown or trusted view registry.

All twenty-four lessons (48 framework paths) are covered by `npx nx workbench-e2e www`.
The optional selected-lesson filter is also available for local verification.


### Canonical onboarding

The `first-plan`, `conversation`, and `system-instructions` lessons add the first
learning steps without changing the existing lesson default. First-plan exposes
the same pure PlanCard used by FirstPlanApp and makes no application write. The
new FirstPlanApp and first-plan-main files are standalone source for the public
Quickstart; older WelcomeCard/App entry points remain for legacy fixtures.
ConversationBasics supplies the minimal text example. The workbench wraps those
contracts in its inspector and capture timeline.

Plain-text onboarding uses no tools or UI schema. The Instructions view compares
captured browser configuration with the fixed public policy observed from actual
mapped provider input. It is not an authorization mechanism. Nineteen lessons
produce 38 Angular/React verification paths; recording only these three uses
`WORKBENCH_LESSONS=first-plan,conversation,system-instructions npx nx workbench-demo www`.
The six new canonical media IDs each have MP4/WebM, poster, result image, measured
captions and walkthrough. Preserve unique capture reports; no SDK release.

### Canonical workflow lessons

`shared-state`, `activities`, and `interrupts` use text chat in both frameworks.
The local agent explicitly maps validated shared state into provider context and
wraps actual streamed model text with state, activity, and approval protocol events.
`setState` is a full local replacement and does not generate. Activities report
context validation and provider completion, not execution of the plan steps.
Interrupts asks two boolean approvals. A whole batch resumes the same user turn;
a later ordinary turn creates a fresh batch. Denial/cancellation does not delegate.
The bounded, five-minute, process-local approval store is demo infrastructure,
not production authentication or durable recovery. Replay captures SDK observations
and application form drafts separately and never submits historical decisions.

Record only this batch with `WORKBENCH_LESSONS=shared-state,activities,interrupts`
and `npx nx workbench-demo www`. The six live recordings use OpenAI; they do not
require TypeSafe. Fixture verification remains labelled `test-fixture`.

### Canonical text history lessons

`message-history` and `save-text-conversations` use actual text chat with no tools
or UI schema. The first keeps a completed in-memory projection and replaces the
SDK transcript explicitly. The second saves Lighthouse and Harbor to independent
browser keys. Selecting a slot does not load or send; saving requires a successful
completed stop. Invalid/unknown storage remains untouched until explicitly cleared.
The format is bounded to 40 messages, 2,000 characters each and 64,000 UTF-8 bytes.
It omits IDs and canonical checkpoint data. Storage failure preserves live chat.

Record these four paths with
`WORKBENCH_LESSONS=message-history,save-text-conversations npx nx workbench-demo www`.
History makes two provider calls; saved text makes three across independent live
runtimes and a hard refresh. The post-refresh timeline captures only the new page.
Replay never calls a provider, replaces live messages or writes storage. Each
recording has both codecs, captions, poster, result and walkthrough. Keep raw
captures; no SDK release.


### Canonical server conversations

Open `?lesson=server-threads` or `?lesson=public-endpoint` in either framework host.
Start a local demo session, load a provisioned Lighthouse/Harbor thread, and send
through actual Hashbrown text chat. Saves are explicit successful completed text,
with the strict shared codec and owner-scoped atomic version checks. A competing
ordinary HTTP write produces a genuine stale-version 409 without overwriting
unsaved client messages. Reload is explicit.

The endpoint lesson records an anonymous 401, an authorized real stream, and a
foreign-owner 404 before provider work. The HttpOnly local session and process
memory repository are teaching integrations, not production authentication or
agent checkpoints. They survive browser refresh only while the server lives.
Replay follows immutable safe HTTP operations and SDK observations without
requests or writes; a refreshed page does not reconstruct the old stream.

Record with `WORKBENCH_LESSONS=server-threads,public-endpoint npx nx workbench-demo www`
and existing server-only OpenAI credentials/model. Four framework-specific
recordings have both codecs, captions, poster, result and text walkthrough.


### Canonical agent decisions, JSON parsing and forms

Use `?lesson=agent-decisions`, `?lesson=json-parser`, or `?lesson=natural-forms`.
Agent text chat calls server-owned TypeSafe routing and fixed read-only handlers;
decisions arrive whole and handler text is application output. Parser and forms
use actual text chat plus direct useJsonParser/injectJsonParser over raw OpenAI
JSON. Source completion, parser completion and original JSON validation remain
independent. Forms reviews a fresh valid draft into editable fields; explicit
Apply validates current source, turn, revision and reviewed values once.

Record `WORKBENCH_LESSONS=agent-decisions,json-parser,natural-forms npx nx workbench-demo www`
with existing server-only OpenAI/TypeSafe credentials and exact models. Six
framework-specific captures disclose unchanged-event pacing and half-speed footage.
Replay is read-only. Legacy standalone examples and media remain independent.
