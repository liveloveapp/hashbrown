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
Legacy basket example sources remain; their recordings were retired.

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
CI uses clearly labelled native API fixtures. Legacy trip example sources remain.

## Canonical Threadplane

`canonical-workbench-threadplane-{react,angular}` uses separately installed consumers with Threadplane's actual transcript and composer inside the optional canonical inspector and timeline. React retains Hashbrown `useChat`; Angular uses Threadplane's AG-UI frontend against the Hashbrown server adapter. Both use real provider output, preserve the first turn in the follow-up, and keep application state unchanged. Replay makes no requests or writes.

Run `DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-live-demo www` to verify the canonical shell with real provider output without publishing footage, and `npx nx docs-threadplane-live-demo www` to record the real consumers. Both require server-only `OPENAI_API_KEY` and explicit `OPENAI_MODEL`. Installation and source pins are documented in `www/examples/threadplane-consumers/README.md`; these are installed integration paths, not additional hosted lesson routes.

## Retired recordings

The pre-canonical recordings (ATC concept clips, WelcomeCard and conversation, workflows, structured output, production, recipes, decisions in agents, local models, request transformation, UI chatbot, JSON parser and standalone Threadplane) have been deleted, and their `record-docs-*` recorders and nx targets were removed with them. Every guide now uses the canonical workbench recordings above. The example sources in `www/examples/quickstart` remain. See `docs/docs-media-inventory.md` for coverage.
