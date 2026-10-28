# Documentation media inventory

Updated 2026-10-28. This inventory describes the current guides and their recording sources. Historical captures remain available for bookmarks and independent tests; they are not the current walkthroughs unless listed below.

## Current canonical coverage

The workbench has 28 lessons, each implemented in Angular and React: 56 framework paths. The shared two-step plan, LLA styling, chat feed, paired inspector and bottom playback keep the teaching context consistent. The two `start/workbench` overview recordings use `canonical-workbench-{react,angular}`.

Each lesson below has a separate recording per framework. The media ID is `canonical-workbench-<recording>-<sdk>`, where `<sdk>` is `angular` or `react`. A lesson can introduce more than one guide without requiring another recording.

| Lesson | Recording | Guide path below `/docs/<sdk>/` |
| --- | --- | --- |
| First plan | `first-plan` | `start/intro`, `start/quick`, `start/how-it-works` |
| Messages and turns | `conversation` | `concept/ai-basics` |
| System instructions | `system-instructions` | `concept/system-instructions` |
| Generative UI | `ui` | `concept/components` |
| Tools | `tools` | `concept/functions` |
| Structured output | `structured` | `concept/structured-output` |
| Streaming | `streaming` | `concept/streaming` |
| Schemas | `schemas` | `concept/schema` |
| Decisions | `decisions` | `concept/decisions` |
| Shared agent state | `shared-state` | `concept/shared-agent-state` |
| Activities | `activities` | `concept/activities` |
| Interrupt and resume | `interrupts` | `concept/interrupt-and-resume` |
| Message history | `message-history` | `concept/message-history` |
| Debugging | `debugging` | `concept/debugging` |
| Request transformation | `request-transformation` | `concept/transform-request-options` |
| Save text conversations | `save-text-conversations` | `recipes/browser-history` |
| Server-owned threads | `server-threads` | `recipes/threads` |
| Public endpoints | `public-endpoint` | `recipes/public-endpoint` |
| Magic Text | `magic-text` | `recipes/magic-text` |
| Predictive suggestions | `predictions` | `recipes/predictive-actions` |
| UI selection | `ui-selection` | `recipes/ui-selection` |
| Decisions in agents | `agent-decisions` | `recipes/decisions-in-agents` |
| Streaming JSON Parser | `json-parser` | `recipes/json-parser` |
| Natural language forms | `natural-forms` | `recipes/natural-language-to-structured-data` |
| Local models | `local-models` | `recipes/local-models` |
| JavaScript runtime | `javascript-runtime` | `concept/runtime` |
| UI Kits | `ui-kits` | `recipes/ui-kits` |
| UI chatbot | `ui-chatbot` | `recipes/ui-chatbot` |

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

## Retained legacy assets

Earlier WelcomeCard, conversation, persistence, workflow, UI Kit, light-chatbot, shopping-list, parser, decisions, assisted-interface and ATC recordings remain for old links and independent fixtures. Their source disclosures still apply. A retained asset is not evidence that the current guide uses it.

Retained standalone Threadplane shipping clips and workflow/tutorial recordings may use scripted AG-UI events and recorder-only presentation styles. Earlier parser clips use a finite local JSON source; earlier ATC clips disclose fixture traffic and scripted replies. Do not label any of these as live model output. Remote MCP and CopilotKit learning sections are retired with compatibility redirects; they are not recording backlog items.

## Reproduction and verification

The workbench source is `www/examples/quickstart`; its shared runtime is under `runtime`, framework clients under `angular` and `react`, and checked server boundaries under `server`. Recorders, fixtures and verification helpers live under `www/src/tools`.

Set server-only `OPENAI_API_KEY` and `OPENAI_MODEL` for chat recordings. TypeSafe lessons additionally require `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. Do not expose keys in a browser bundle or recording.

```sh
WORKBENCH_LESSONS=ui-kits,ui-chatbot npx nx workbench-demo www
DOCS_SKIP_RECORDING=1 npx nx docs-threadplane-demo www
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
