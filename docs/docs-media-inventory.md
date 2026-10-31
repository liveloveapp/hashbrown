# Documentation media inventory

Updated 2026-10-30. This inventory describes the current guides and their recording sources. Pre-canonical recordings were deleted on 2026-10-30; only the media listed below is published.

## Current canonical coverage

The workbench has 28 lessons, each implemented in Angular and React: 56 framework paths. The shared two-step plan, LLA styling, chat feed, paired inspector and bottom playback keep the teaching context consistent.

Each lesson below has a separate recording per framework. The media ID is `canonical-workbench-<recording>-<sdk>`, where `<sdk>` is `angular` or `react`. A lesson can introduce more than one guide without requiring another recording.

| Lesson                  | Recording                 | Guide path below `/docs/<sdk>/`                    |
| ----------------------- | ------------------------- | -------------------------------------------------- |
| First plan              | `first-plan`              | `start/intro`, `start/quick`, `start/how-it-works` |
| Messages and turns      | `conversation`            | `concept/ai-basics`                                |
| System instructions     | `system-instructions`     | `concept/system-instructions`                      |
| Generative UI           | `ui`                      | `concept/components`                               |
| Tools                   | `tools`                   | `concept/functions`                                |
| Structured output       | `structured`              | `concept/structured-output`                        |
| Streaming               | `streaming`               | `concept/streaming`                                |
| Schemas                 | `schemas`                 | `concept/schema`                                   |
| Decisions               | `decisions`               | `concept/decisions`                                |
| Shared agent state      | `shared-state`            | `concept/shared-agent-state`                       |
| Activities              | `activities`              | `concept/activities`                               |
| Interrupt and resume    | `interrupts`              | `concept/interrupt-and-resume`                     |
| Message history         | `message-history`         | `concept/message-history`                          |
| Debugging               | `debugging`               | `concept/debugging`                                |
| Request transformation  | `request-transformation`  | `concept/transform-request-options`                |
| Save text conversations | `save-text-conversations` | `recipes/browser-history`                          |
| Server-owned threads    | `server-threads`          | `recipes/threads`                                  |
| Public endpoints        | `public-endpoint`         | `recipes/public-endpoint`                          |
| Prose              | `prose`              | `recipes/prose`                               |
| Predictive suggestions  | `predictions`             | `recipes/predictive-actions`                       |
| UI selection            | `ui-selection`            | `recipes/ui-selection`                             |
| Decisions in agents     | `agent-decisions`         | `recipes/decisions-in-agents`                      |
| Streaming JSON Parser   | `json-parser`             | `recipes/json-parser`                              |
| Natural language forms  | `natural-forms`           | `recipes/natural-language-to-structured-data`      |
| Local models            | `local-models`            | `recipes/local-models`                             |
| JavaScript runtime      | `javascript-runtime`      | `concept/runtime`                                  |
| UI Kits                 | `ui-kits`                 | `recipes/ui-kits`                                  |
| UI chatbot              | `ui-chatbot`              | `recipes/ui-chatbot`                               |

Every new canonical recording includes MP4, WebM, a poster, a result screenshot, measured WebVTT captions and a text walkthrough. Files live under `www/public/video/docs`; the media registry is `www/src/components/elements/docs-demo-media.ts`.

## Recording provenance

The local-model pair uses actual native Chrome inference through each framework structured-chat client. The pre-existing dedicated v4 test configuration had an available model; no new model was downloaded and that browser configuration does not establish model identity or default-device availability. Its footage runs at actual speed with reading pauses. Native EOF emits SDK terminal events; original JSON and application acceptance are checked separately. Separate labelled native API fixtures test unsupported states and recovery; they are never published as inference footage.

The JavaScript runtime pair uses actual native framework QuickJS execution of visible application-owned scripts, with real host calls and result/error wrappers. No model/provider request or simulated JSON streaming. The estimates, failed capabilities and recovery preserve application state; replay executes no scripts.

Canonical chat recordings use actual Hashbrown framework APIs, real OpenAI requests and the real tool handlers where registered. Decision and UI-selection lessons use actual TypeSafe decisions, which arrive whole. The Decisions in Agents lesson invokes fixed application-owned handlers after a whole route decision; its reply is not model-generated streaming prose. Confidence is not correctness or authorization.

The normal workbench streams provider events as received. For filming, unchanged protocol events are paced at 20 ms, and footage is encoded at half speed for readability. Captions and walkthroughs disclose this. Recordings have no narration. Provider output is never replaced with a local fixture for publication. Separate deterministic browser suites are visibly labelled `test-fixture` and are not published as live recordings.

The latest authoring recordings preserve actual outcomes: a 0.74 agent choice uses the unchanged 0.75 clarification gate; natural forms shows the model rewriting an edited field, then an explicit user correction in the reviewed form before Apply. The kit recordings distinguish actual registry/schema configuration, the selected trusted component and application-owned acceptance. Their server policy requires a fresh successful readContext result before UI generation, then disables further tool calls for that response. A configured fallback does not establish successful source completion.

## What each boundary demonstrates

- **UI, kits and forms:** rendering or parsing a draft does not apply it. Original JSON, source completion, current request and application revision are checked before an explicit action. PlanReading is read-only. Model reports are distinct from authoritative application state.
- **Streaming and schemas:** parser values, successful source completion, original-document validation and application rules are independent. Partial values are observations, not completed documents.
- **Tools:** readContext returns the actual accepted plan and revision. A tool result supplies context; it does not prove that a subsequent model report is correct.
- **Workflow lessons:** actual SDK shared-state observations, activity lifecycle and interrupt batches are captured. Approval permits a checked explanation, not execution of the plan steps. The process-local agent does not supply durable recovery.
- **History:** browser and server persistence save bounded, successfully completed text. Refresh and explicit restoration start a new capture; they do not reconstruct old requests or restore tools, generated UI, shared state or pending interrupts.
- **Public endpoints and server threads:** real HTTP identity/ownership checks precede provider work. The local session and in-memory repository demonstrate integration boundaries, not a deployed identity service or durable database. Stale writes genuinely return 409 and preserve unsaved text until explicit reload.
- **Debugging and request transformation:** the deliberate local 403 happens before provider work. Transformation traces come from the actual adapter callback after mapping, with safe public fields only.
- **Playback:** immutable captured values drive requests, JSON, components and state together. Replay makes no provider calls, invokes no component callbacks and performs no application writes.

## Canonical installed integrations

Threadplane completes the primary standalone guide rollout. Its separately installed Angular and React consumers use the same two-step trusted UI plan, follow-up, LLA workbench shell, paired inspector and bottom timeline. They retain Threadplane's own transcript and composer. The media IDs are `canonical-workbench-threadplane-{angular,react}`.

These are two installed integration paths alongside the 28 bundled lessons / 56 framework paths. They do not add a hosted `?lesson=threadplane` route or force external package installation into the normal workbench build. The optional shell is built separately after installed-consumer compilation and served by checked local hosts. Public documentation embeds the recordings; installation instructions reproduce the actual consumer.

Both replacement recordings use real provider output through the actual Hashbrown OpenAI server adapter. React retains Hashbrown `useChat` behind Threadplane `TextTranscript` / `ChatInput`; Angular uses Threadplane's AG-UI frontend and `ChatComponent`. Actual protocol JSON and streamed text are distinct views. No generated component or parsed plan is claimed, and application state stays at revision zero. Replay makes no requests or writes. Footage runs at actual speed with measured captions and reading pauses.

The Threadplane migration guides keep runtime, presentation, identity, history, tools and component ownership explicit. Installation is checked against each framework's own consumer. Labelled provider-native fixtures verify keyboard interaction, failures, truncation, cancellation, recovery and standalone mobile layout; fixture publication is rejected. Real recording is a separate credentialed target.

No primary guide pair remains on standalone scripted footage. Next is a consistency and accessibility review across the full set; durable agent state, production identity and storage remain separate integrations.

## Retired legacy assets

The pre-canonical WelcomeCard, conversation, persistence, workflow, UI Kit, light-chatbot, parser, structured, recipe, decisions, local-model, request-transformation and standalone Threadplane recordings, and the `canonical-workbench-{react,angular}` overview copies of the generative UI lesson, were deleted on 2026-10-30. No guide referenced them. Their recorders (`www/src/tools/record-docs-*.ts` for quickstart, workflows, structured, production, recipes, local models, request transformation, standalone Threadplane, agent decisions, light chatbot and parser), the matching `docs-*-demo` nx targets, and their recorder-only fixtures and specs were removed the same day. Two `record-docs-*` recorders remain because they write current canonical media: `record-docs-threadplane-live.ts` (`docs-threadplane-live-demo`, `canonical-workbench-threadplane-*`) and `record-docs-production-reference.ts` (`npx nx demo production-reference`, `canonical-workbench-production-recovery-*`).

## Accessibility and consistency checks

The 60 active recordings are reused by 44 canonical video teasers and 96 inline workbench panels. The two ATC case-study pages retain their separate ATC teaser. Their caption intervals are ordered, nonempty and at most 20 characters per displayed second. The initial overview, generative UI, tools, schemas, streaming, structured output, debugging, request transformation, decisions and UI-selection captions were shortened where needed, without retiming or replacing footage. Text walkthroughs and recorder sources use the same concise descriptions. Runtime ownership and source disclosures are preserved.

Video players keep native controls and captions, with a visible caption associated to each player and a context-specific text-walkthrough link. Workbench tab strips use one Tab stop with arrow/Home/End navigation; request-detail rebuilds preserve keyboard focus. The bottom range names its turn, event, milestone and elapsed time. Lifecycle status is polite and deduplicated; stream tokens and JSON panels are not live regions. Playback shortcuts leave focused links and interactive controls alone.

## Reproduction and verification

The workbench source is `www/examples/quickstart`; its shared runtime is under `runtime`, framework clients under `angular` and `react`, and checked server boundaries under `server`. Recorders, fixtures and verification helpers live under `www/src/tools`.

Set server-only `OPENAI_API_KEY` and `OPENAI_MODEL` for chat recordings. TypeSafe lessons additionally require `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. Do not expose keys in a browser bundle or recording.

```sh
WORKBENCH_LESSONS=ui-kits,ui-chatbot npx nx workbench-demo www
DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-live-demo www
npx nx docs-threadplane-live-demo www
npx nx workbench-e2e www
npx nx build www
npx nx test www
npx nx lint www
npx nx e2e www
```

Keep unique masters, phase reports and failed-run evidence in ignored `dist/docs-workbench/captures/<run-id>`. Verify deterministic framework paths before live recording; publish only successful provider runs. Decode both codecs, check caption bounds/reading speed and images, then verify native playback, served asset hashes and guide references in a production build. Repeat public verification after the exact merged deployment.

## Separate content work

- Durable canonical agent checkpoints need a separate design covering generated UI, tools, shared state and interrupted workflows. Completed-text persistence does not provide that contract.
- Production identity, atomic durable storage, distributed admission control, retention and operational observability remain application integrations; local fixtures do not satisfy those requirements.
- Keep learning guides task-focused and link to generated API reference for the full inventories. Check snippets against the real framework APIs before polishing their prose.
- Typography selection and the SDK release remain separate work.

## Opt-in production recovery reference

`platform/b4run` in Angular and React accompanies the `production-recovery` lesson. It runs against the separate TypeScript/Postgres `production-reference` server, with native b4.run checkpoints, approval grants, shared run admission, and a transactionally accepted application plan. It is excluded from the public anonymous workbench lesson count above.

The published recording IDs are `canonical-workbench-production-recovery-{angular,react}`. The 2026-10-28 captures use real OpenAI output, the actual native b4.run runtime and isolated Postgres. Each crosses a server process replacement, restores one approval without another run, and explicitly approves before the application advances from revision 0 to 1 with one database receipt. Playback adds no requests or writes. Footage runs at actual speed: 33.13 seconds for React and 32.27 seconds for Angular, each with seven readable caption cues, a text transcript, poster and result image.

Measured evidence and masters: `dist/docs-production-reference/captures/2026-10-28T21-41-32.586Z`. `npx nx demo production-reference` reproduces the pair with an isolated database, server-side OpenAI credentials and ffmpeg. The recorder stages both complete companion sets before publication. Together with the primary set above, there are 62 active recordings reused across the current guides. The opt-in reference endpoint is not registered by the public anonymous backend.

The two production-reference recordings now include matching `-capture.json` companions, recorded from the mounted clients and stamped with recorder source commit `c155e8a23a7529c26054283e9940fae19c6f2caa`. React records 27 events; Angular records 26. These traces begin after the browser refresh: they retain the restored approval, native resume, and observed application revision 1. They do not reconstruct the original stream timing shown earlier in the video. Both captures load into fresh embedded replays with the backend unavailable; seeking and playback make no API requests, and recovery and approval controls remain disabled.

## Teaching order

Authored Angular and React guides now open with a relevant recorded teaser. The prose introduces the concept and an ordinary application implementation before the separate workbench walkthrough and its inline Replay/Live panel where supported. Architecture flows explain data and ownership boundaries where useful. Provider teasers retain their actual source disclosure; a client recording is not evidence that another provider or a historical SDK version was run.

`npx nx check-docs-examples www` extracts the introductory application examples from Markdown and compiles them against the public APIs, including strict Angular templates. It runs as a dependency of the docs tests. Its manifest covers the new concept and recipe modules; installed Threadplane consumers, the existing standalone local-model applications, historical migrations, and full Quickstart setups retain their separate checks. Workbench excerpts remain checked against the canonical source.

The prose lesson media was refreshed from its existing OpenAI captures through the renamed workbench in read-only replay. Capture timestamps and commit provenance remain original; lesson IDs and endpoint paths were migrated to `prose`. Captions and transcripts identify replay explicitly.
