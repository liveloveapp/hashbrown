# Documentation media inventory

Updated 2026-10-23. Paths are below `/docs/<sdk>/`; React and Angular share a recording when the visible behavior is the same. React-only CopilotKit is listed separately in the source navigation. Verify both SDK implementations before sharing a capture. This is a production backlog, not a claim that every guide has a recording.

## Current recordings

| Recording | Source | Pages | Notes |
| --- | --- | --- | --- |
| Welcome card | `www/examples/quickstart/{react,angular}` | Introduction, Quickstart | Real client rendering; deterministic AG-UI output; presentation CSS added in recorder |
| Conversation | `www/examples/quickstart/{react,angular}` | Messages and turns, System instructions, Message history | Name and follow-up in the same instance; does not demonstrate persistence |
| Generative UI | `examples/atc` | Exposing components | Trusted ATC components |
| Streaming | `examples/atc` | Streaming | Incremental ATC response |
| Browser tools | `examples/atc` | Tool calling | Fixture traffic read through tools |
| Schemas | `examples/atc` | Skillet schemas, Structured output | Typed flight filter |
| Decisions | `examples/atc` | Decisions | Intent routing and component narrowing |
| Debugging | `examples/atc` | Debugging | ATC-specific inspector, separate from Redux DevTools |

All recordings have MP4, WebM, a poster, captions, and a text walkthrough under `www/public/video/docs`. Welcome card and conversation have result screenshots. ATC captures disclose fixture traffic and scripted responses. New tutorial captures disclose scripted responses and use the actual published client example files.

## Next production batch

1. Interrupt and resume: record the pause, the choice, and the resumed result.
2. Shared agent state: show a UI edit reaching the agent and an agent update reaching the UI.
3. Activities: show progress in a concrete task, including completion.
4. UI kits: start with a constrained component set and show a task selecting from it.
5. Persistence/Threads: show a refresh and conversation switch. The current conversation recording must not stand in for this behavior.

Each recording needs a deterministic fixture, an example owner, a visible success result, and a written guide that stands on its own. Reuse installed recording tools; no new hosting dependency.

## Page coverage

| Page | Status | Recording or remaining work |
| --- | --- | --- |
| `concept/activities` | Needs recording | Start a task and watch activity progress update. |
| `concept/ai-basics` | Recorded | conversation |
| `concept/components` | Recorded | generative-ui |
| `concept/debugging` | Recorded | debugging |
| `concept/decisions` | Recorded | decisions |
| `concept/functions` | Recorded | browser-tools |
| `concept/interrupt-and-resume` | Needs recording | Pause for confirmation, choose an option, and resume. |
| `concept/message-history` | Recorded | conversation |
| `concept/runtime` | Needs recording | Generate code, run it in the sandbox, inspect the returned value. |
| `concept/schema` | Recorded | schemas |
| `concept/shared-agent-state` | Needs recording | Change app state and show the agent observing the update. |
| `concept/streaming` | Recorded | streaming |
| `concept/structured-output` | Recorded | schemas |
| `concept/system-instructions` | Recorded | conversation |
| `concept/transform-request-options` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `guide/choosing-model` | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction. |
| `guide/ethics` | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction. |
| `guide/prompt-engineering` | Intentional exception | Decision-oriented guidance; add video only for a concrete interaction. |
| `migrations/v0-5` | Intentional exception | Version-specific changes are easier to scan as before/after code. |
| `migrations/v0-6` | Intentional exception | Version-specific changes are easier to scan as before/after code. |
| `migrations/v0-7` | Intentional exception | Version-specific changes are easier to scan as before/after code. |
| `migrations/v0-8` | Intentional exception | Version-specific changes are easier to scan as before/after code. |
| `platform/anthropic` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/azure` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/bedrock` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/custom` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/google` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/ollama` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/openai` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `platform/typesafe` | Intentional exception | Credentials and host configuration belong in named, copyable files. |
| `recipes/copilotkit` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/decisions-in-agents` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/json-parser` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/local-models` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/magic-text` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/natural-language-to-structured-data` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/predictive-actions` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/public-endpoint` | Needs recording | Show a rejected unauthenticated request followed by an authorized request. |
| `recipes/remote-mcp` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/threads` | Needs recording | Switch conversations and restore the selected thread. |
| `recipes/ui-chatbot` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/ui-kits` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `recipes/ui-selection` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/intro` | Recorded | welcome-card |
| `start/overview` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/platforms` | Needs recording | Record the page’s own example from input through visible result; capture one useful result screenshot. |
| `start/quick` | Recorded | welcome-card |
| `start/sample` | Recorded | Existing `www-atc-demo-video` player; full ATC interaction. |

## Content gaps after this increment

- **How Hashbrown works:** one browser → endpoint → provider → streamed events → trusted component walkthrough, with separate state and tool boundaries.
- **Troubleshooting:** expand the new Debugging guide with concrete schema errors, cancellation, interrupted runs, and request examples.
- **Persistence:** test storage examples against the full canonical history and explain refresh, runtime recreation, thread identity, and migration of saved data.
- **Production:** connect authentication, authorization, rate limits, observability, and accessibility to complete example endpoints.
- **Editorial:** continue replacing dense API inventories in learning pages with a minimal task and links to generated reference. Verify stale snippets before editing prose around them.
- **Visual comparison:** compare system sans-serif prose against the current body typeface and test line length, heading hierarchy, and on-page navigation before choosing a typography change.

## Reproduction

`npx nx typecheck www` checks client and server files, including Angular strict templates. The docs tests compare published code blocks with these source files. To record: `npx nx docs-demo www`. The recorder verifies React and Angular success, loading, follow-up history, and welcome-card error recovery. It writes capture masters and a verification report to ignored `dist/docs-quickstart` and published encodes/screenshots to `www/public/video/docs`. Review the result before updating captions or posters.
