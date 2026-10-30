# Documentation demo media

Current guides use 60 canonical recordings: the 28 Angular/React workbench lesson pairs, the production-recovery pair, and the separately installed Threadplane pair. Each recording has MP4, WebM, a poster, a result screenshot, measured WebVTT captions, and a plain-text walkthrough. See [the media inventory](../../../../docs/docs-media-inventory.md) for current guide paths and source boundaries.

The standard recorder is `npx nx workbench-demo www`, with `WORKBENCH_LESSONS` selecting the teaching focus. Provider keys and model settings stay in the server environment. Hosted chat clips use actual provider output, with unchanged events paced at 20 ms and footage slowed to half speed. Decisions arrive whole. JavaScript runtime clips show real application-owned QuickJS execution without a model request. Local-model and Threadplane clips run at actual speed with reading pauses. None has narration.

The player loads on demand, includes native captions, and links a text walkthrough named for its recording. Caption intervals follow measured interaction phases. The publication gate rejects invalid intervals or captions above 20 characters per encoded second; the active-media regression test checks all 60 recordings. Captions can be shortened without retiming the footage or changing its provenance. New encodings and companions stay in the unique capture directory until every selected recording passes its checks; an incomplete staged batch leaves the current media in place.

## Canonical text history

`canonical-workbench-message-history-{react,angular}` shows two real OpenAI turns
with explicit keep, clear and restore operations.
`canonical-workbench-save-text-conversations-{react,angular}` shows three real
turns, separate Lighthouse and Harbor saved slots, a hard refresh, and explicit
load into a new SDK runtime. A refreshed timeline never invents the old trace.
All four have MP4/WebM, measured captions, posters, result screenshots and text
walkthroughs. Storage contains only validated completed text, not agent checkpoints.
No model calls or storage writes occur during synchronized replay. Provider events
are paced unchanged for filming and footage is shown at half speed. Originals
and reports remain in unique ignored capture directories. No narration.

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

Access shows an anonymous 401, an authorized model request and a foreign-owner 404. The local demo session is server-minted; the process-memory repository is
isolated per session. These integrations demonstrate boundaries and are not
production authentication or durable storage. No credentials appear in captures.

All twenty-one lessons have two framework paths (42 total). Each new recording
has MP4/WebM, measured captions, poster, result and an honest walkthrough.
Unchanged provider events are paced 20 ms for filming and footage is half speed.
Replay is inert. Unique ignored capture directories retain masters and reports.
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

All twenty-eight lessons have two framework paths (56 total). Each new ID has both
codecs, measured captions, poster/result and a truthful walkthrough. Unchanged
protocol event pacing and half-speed footage are disclosed. Replay performs no
requests or writes. Unique ignored capture directories retain masters/reports.
No SDK release.

## Canonical UI kits and chatbot

`canonical-workbench-{ui-kits,ui-chatbot}-{react,angular}` use real OpenAI output, actual framework kit/UI chat APIs and browser readContext. The recorded kit registry and schema come from each SDK. Only explicit validated acceptance changes state; PlanReading has no write action. Both codecs, measured captions, poster, result and transcript accompany each recording. See `docs/docs-media-inventory.md` for current coverage and source boundaries.

## Canonical JavaScript runtime

`?lesson=javascript-runtime` uses native framework Hashbrown QuickJS APIs against
the same application-owned two-step plan. Visible scripts estimate 30 and 20
minutes, then demonstrate browser/host failures and recovery. No model or API key
is needed. Code, actual host calls and outcomes are immutable captured values;
playback performs no execution or writes. The plan stays at revision zero.

The two `canonical-workbench-javascript-runtime-{react,angular}` recordings use
actual execution, both codecs, measured captions, poster/result and transcripts.
Record with `WORKBENCH_LESSONS=javascript-runtime npx nx workbench-demo www`.
Legacy basket sources and media remain for old links and independent checks.

## Canonical local models

`?lesson=local-models` prepares a browser-native model explicitly, then runs real
framework structured chat over `experimental_chrome`. Requests shows LOCAL
Chrome Prompt API, actual envelopes/events and native metadata; it does not
fabricate HTTP status. Original JSON, successful current stream completion and
explicit acceptance guard each application revision. Replay prepares nothing,
opens no native sessions, prompts nothing and writes no application state.

`canonical-workbench-local-models-{react,angular}` contains separate actual native
recordings with both codecs, measured captions, posters/results and transcripts.
Unlike the hosted recordings, footage runs at actual speed with reading pauses.
The existing dedicated test profile uses requested v4 configuration and must
already report available; recording starts no model download and no hosted call.
`WORKBENCH_LESSONS=local-models npx nx workbench-demo www` records locally only.
CI uses clearly labelled native API fixtures. Legacy trip examples remain.

## Canonical Threadplane

`canonical-workbench-threadplane-{react,angular}` uses separately installed consumers with Threadplane's actual transcript and composer inside the optional canonical inspector and timeline. React retains Hashbrown `useChat`; Angular uses Threadplane's AG-UI frontend against the Hashbrown server adapter. Both use real provider output, preserve the first turn in the follow-up, and keep application state unchanged. Replay makes no requests or writes.

Run `DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-demo www` for labelled standalone fixture checks. Run `npx nx docs-threadplane-live-demo www` with server-only `OPENAI_API_KEY` and explicit `OPENAI_MODEL` to record the real consumers. Fixture publication is rejected. Installation and source pins are documented in `www/examples/threadplane-consumers/README.md`; these are installed integration paths, not additional hosted lesson routes.

## Retained standalone recordings

The following sections describe earlier assets retained for bookmarks and independent verification. They are not the current primary walkthroughs. Their scripted output and fixture disclosures still apply.

The five ATC recordings below use scripted model responses and fixture traffic. They have no narration or soundtrack. The recordings identify the scripted data in their footer; the documentation figure and text walkthrough repeat it. The original ATC streaming recording was replaced by the shopping-list recording documented below.

Each topic has an H.264 MP4, VP9 WebM, PNG poster, WebVTT descriptions, and plain-text walkthrough. Generative UI and decisions also have result screenshots. The same behavior recordings are shared by the React and Angular guides.

| Recording     | Documentation page |
| ------------- | ------------------ |
| generative-ui | concept/components |
| browser-tools | concept/functions  |
| schemas       | concept/schema     |
| decisions     | concept/decisions  |
| debugging     | concept/debugging  |

Source footage comes from `examples/atc/e2e/demo/record.ts`, recorded with `npx nx demo atc-e2e -- --demo-only`. ffmpeg trims and combines the corresponding named scenes with chapter graphics and exports the web formats. Master footage, edit script, scene manifest, and review contact sheets are in the local `dist/docs-media/` production output. The recording reflects the ATC source at commit `52db6954`; refresh footage when those examples materially change.

The debugging recording was captured separately from the same ATC app using its keyboard-accessible developer drawer, Router, UI stream, and Tools tabs. Its local production scripts and footage are in `dist/docs-media/record-debugging.ts` and `dist/docs-media/debugging-work/`, with ffmpeg edits in `dist/docs-media/debugging-production/`. It demonstrates the example app’s inspector; the separate Redux DevTools instructions are in each Debugging guide.

### First-component and conversation recordings

`welcome-card` and `conversation` use the exact client source in `www/examples/quickstart`, verified in React and Angular. The recorder streams deterministic AG-UI output into the actual clients; it does not use a provider key. Added presentation CSS is disclosed in the guide/player. Source recorder: `www/src/tools/record-docs-quickstart.ts`; run `npx nx docs-demo www`. Captures/masters and verification results remain in ignored `dist/docs-quickstart`. The conversation recording demonstrates context within one instance, not persisted history after a refresh.

### Typed drafts and progressive items

`structured-form` and `streaming-data` record the checked shopping-list clients. Source: `www/src/tools/record-docs-structured.ts`; run `npx nx docs-structured-demo www`. Both React and Angular are verified; React supplies the shared recording. Scripted AG-UI output, added presentation CSS, no narration, live model, purchase or server write. Generate → review → Apply is explicit. The applied list is component-local state. Complete capture masters and adverse-ending verification remain in ignored `dist/docs-structured`. See `docs/docs-media-inventory.md` for current page coverage and remaining work. These recordings are retired: the docs now use the canonical workbench recordings, and running this target recreates media no page uses (see `docs/docs-media-inventory.md`).

### Magic Text, suggestions and view selection

`magic-text`, `predictive-suggestions` and `ui-selection` use the checked framework clients in `www/examples/quickstart`. Source: `www/src/tools/record-docs-recipes.ts`; run `npx nx docs-recipes-demo www` sequentially with other recorders. Both frameworks are verified before React supplies the shared captures. Text/completion output uses scripted AG-UI responses; view selection uses scripted decision responses. Presentation CSS is added. No narration, live model call or server write is shown.

The interactions are streaming Markdown with citation details, explicit Accept/Dismiss of a context-bound packing proposal, and summary/list selection with app-owned data. Each includes MP4/WebM, a poster, captions, a walkthrough and result screenshot. Captures, masters, static builds and the browser verification report remain in ignored `dist/docs-recipes`. Use `DOCS_SKIP_RECORDING=1` to check behavior without replacing media, and `DOCS_DEMO_MODES` to select these target-specific IDs. These recordings are retired: the docs now use the canonical workbench recordings, and running this target recreates media no page uses (see `docs/docs-media-inventory.md`).

### Decisions in Agents

`AgentDecisions.tsx` / `agent-decisions.ts` send explicit independent support requests to `/api/agent`. The checked `server/agent-routing.ts`, `agent-app.ts` and `agent-server.ts` pin a TypeSafe schema, validate input and order IDs, and use fixed read-only order/returns handlers. Server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` configure the real local endpoint. Hosted customer access requires application identity, ownership, authorization and request controls.

Run `npx nx docs-agent-decisions-demo www` for both SDK checks and the `agent-routing` / `agent-fallback` recordings. The recorder injects only classifier envelopes and failures into the checked Express app; final replies come from the checked router. Both frameworks pass before React supplies the shared recordings. Presentation styles are added; no provider key, live model or narration is used. Each recording has MP4/WebM, a poster, captions, a walkthrough and result screenshot.

`DOCS_SKIP_RECORDING=1` verifies without replacing media; `DOCS_DEMO_MODES` selects these target-specific IDs and rejects unknown modes. Captures, masters, static builds and reports stay in ignored `dist/docs-agent-decisions`. Run sequentially with the other recorders, which share compiled output. Review final frames and `verification.json` after capture. These recordings are retired: the docs now use the canonical workbench recordings, and running this target recreates media no page uses (see `docs/docs-media-inventory.md`).

### Browser-native trip briefs

`runtime/local-models.ts`, `LocalModels.tsx` and `local-models.ts` provide explicit Prepare model / Generate locally / Cancel actions around the real `experimental_chrome` transport. The small schema extracts a destination and day count; only a fresh, successful, complete, bounded response becomes a ready preview. Preparation owns and destroys its temporary download session, including late cancellation. Generation owns separate transport sessions and rejects implicit downloads. No backend, API key, hosted fallback or new dependency is needed.

Run `npx nx docs-local-models-demo www` locally with an already available native Chrome model in the dedicated test profile. The recorder runs deterministic native-API contract checks in both clients, then real native inference in both frameworks before recording React. It never downloads weights. Mobile checks use the shim for layout/contracts, not native inference. `DOCS_SKIP_RECORDING=1` verifies without replacing assets; `DOCS_DEMO_MODES=local-models` selects the sole supported ID. Captures, masters, static builds and reports stay in ignored `dist/docs-local-models`. Run sequentially with other recorders and GPU suites.
