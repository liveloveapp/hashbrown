---
title: 'Conversation Workbench: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow real requests, streamed JSON, trusted components, and application state through one conversation.'
---

# Conversation workbench

I use one small example to follow a conversation from a prompt to a working interface. Ask for a two-step plan. Watch the JSON arrive, inspect the props, and accept the plan. Then ask for a shorter second step.

The React and Angular versions use the same example, styles, and capture model. Each version uses its own Hashbrown API and component renderer.

## Understand what an inspector can show

An application can observe several layers of one interaction: the user's message, request input, protocol events, parsed values, rendered components, and application state. Those layers answer different questions. A parsed value tells us what became available; an application receipt tells us what was saved.

<hb-diagram diagram="workbench-observations"> </hb-diagram>

Use the normal Hashbrown APIs to build the interface first. The [Quickstart](/docs/react/start/quick) supplies a complete standalone implementation. An inspector and a recording store are optional application tooling, not prerequisites for using the SDK.

## Explore it in the workbench

The workbench below replays a recorded run of this lesson.

<hb-workbench lesson="generative-ui">
</hb-workbench>

The rest of this page describes that optional tooling in our teaching app. The bottom player replays captured observations. It does not restore a live runtime, repeat a tool, or perform an application write.

## Run the example

Try it without installing anything at [workbench.hashbrown.dev/react.html](https://workbench.hashbrown.dev/react.html). Each lesson's local URL in the table below works there too, for example `/react.html?lesson=tools`. The hosted version runs the same server code with a rate limit per visitor. Server-owned threads and Public endpoints run only on the local server, because their demo sessions live in one process.

The [production recovery reference](/docs/react/platform/b4run) uses a separate TypeScript/Postgres server. Run that host to restore native checkpoints and approvals; the public anonymous backend does not expose its endpoints.

To run it yourself, clone the [Hashbrown repository](https://github.com/liveloveapp/hashbrown), install its dependencies, and set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment. Keep the key out of browser code.

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/react.html`. The Angular version is available at `/angular.html` on the same server.

The local server uses the real OpenAI adapter, keeps the model and output limit on the server, and cancels the provider request when the browser disconnects. It does not provide production identity, durable storage, or shared admission control.

## Choose one teaching focus

The collapsible sidebar opens twenty-eight lessons under Get started, Concepts, Production, and Recipes. All use the same two-step plan and keep the chat, the inspector, and the bottom player in view. Drag the handle between the chat and the inspector to resize them. Focus it and use the left and right arrow keys or Home, or double-click it to reset.

The lessons are:

| Lesson                                                                            | Local URL                                    | Follow                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| [First plan](/docs/react/start/quick)                                             | `/react.html?lesson=first-plan`              | One tool-free request and a trusted preview; no application write.         |
| [Messages and turns](/docs/react/concept/ai-basics)                               | `/react.html?lesson=conversation`            | Retained messages, stable thread identity and fresh run identity.          |
| [System instructions](/docs/react/concept/system-instructions)                    | `/react.html?lesson=system-instructions`     | Browser declaration and public effective policy at provider mapping.       |
| [Generative UI](/docs/react/concept/components)                                   | `/react.html?lesson=generative-ui`           | Streamed props and the trusted SummaryCard.                                |
| [Tools](/docs/react/concept/functions)                                            | `/react.html?lesson=tools`                   | Browser context, tool result, and continuation.                            |
| [Structured output](/docs/react/concept/structured-output)                        | `/react.html?lesson=structured-output`       | Plain typed plan data rendered by the application.                         |
| [Streaming](/docs/react/concept/streaming)                                        | `/react.html?lesson=streaming`               | Partial title text and resolved steps.                                     |
| [Schemas](/docs/react/concept/schema)                                             | `/react.html?lesson=schemas`                 | The exact response contract and application validation.                    |
| [Decisions](/docs/react/concept/decisions)                                        | `/react.html?lesson=decisions`               | Complete typed choices, confidence and explicit application.               |
| [Debugging](/docs/react/concept/debugging)                                        | `/react.html?lesson=debugging`               | Local HTTP denial, same-conversation recovery, and captured evidence.      |
| [Request transformation](/docs/react/concept/transform-request-options)           | `/react.html?lesson=request-transformation`  | Actual server callback, added instructions, and preserved provider fields. |
| [Prose](/docs/react/recipes/prose)                                      | `/react.html?lesson=prose`              | Streamed Markdown and actual source-reference selection.                   |
| [Predictive suggestions](/docs/react/recipes/predictive-actions)                  | `/react.html?lesson=predictions`             | Current-context completions and explicit acceptance or dismissal.          |
| [UI selection](/docs/react/recipes/ui-selection)                                  | `/react.html?lesson=ui-selection`            | Whole candidate decisions, app-owned views, and manual choice.             |
| [Shared agent state](/docs/react/concept/shared-agent-state)                      | `/react.html?lesson=shared-state`            | Explicit local state replacement, agent drafts, commit, and rollback.      |
| [Activities](/docs/react/concept/activities)                                      | `/react.html?lesson=activities`              | Actual agent progress messages, links, and fresh activity IDs.             |
| [Interrupt and resume](/docs/react/concept/interrupt-and-resume)                  | `/react.html?lesson=interrupts`              | Complete approval batches and continuation within the same user turn.      |
| [Message history](/docs/react/concept/message-history)                            | `/react.html?lesson=message-history`         | Keep completed text, clear SDK history, restore and continue.              |
| [Save text conversations](/docs/react/recipes/browser-history)                    | `/react.html?lesson=save-text-conversations` | Explicit browser saves, hard refresh and validated text loading.           |
| [Server-owned threads](/docs/react/recipes/threads)                               | `/react.html?lesson=server-threads`          | Explicit server saves, refresh and version conflicts.                      |
| [Public endpoints](/docs/react/recipes/public-endpoint)                           | `/react.html?lesson=public-endpoint`         | Identity and ownership checks before provider work.                        |
| [Decisions in agents](/docs/react/recipes/decisions-in-agents)                    | `/react.html?lesson=agent-decisions`         | Server route decisions and fixed read-only handlers.                       |
| [JSON parser](/docs/react/recipes/json-parser)                                    | `/react.html?lesson=json-parser`             | Raw JSON, real parser values and final document validation.                |
| [Natural language forms](/docs/react/recipes/natural-language-to-structured-data) | `/react.html?lesson=natural-forms`           | Review, edit and explicitly apply a generated draft.                       |
| [UI Kits](/docs/react/recipes/ui-kits)                                            | `/react.html?lesson=ui-kits`                 | Actual kit registry, trusted variants, and explicit acceptance.            |
| [UI chatbot](/docs/react/recipes/ui-chatbot)                                      | `/react.html?lesson=ui-chatbot`              | A proposal, accepted state, and a read-only follow-up.                     |
| [JavaScript runtime](/docs/react/concept/runtime)                                 | `/react.html?lesson=javascript-runtime`      | Actual QuickJS code, validated host calls, results and errors.             |
| [Local models](/docs/react/recipes/local-models)                                  | `/react.html?lesson=local-models`            | Native model preparation, local structured chat and explicit acceptance.   |

Selecting a lesson opens a fresh local page; it does not send a request. Conversations remain in memory within the current page. The player's scrubber shows meaningful milestones by default. Choose **Raw events** to put every captured stream frame on the scrubber.

Prose, predictive suggestions, and UI selection begin with the same application-owned plan at revision zero. Prose explains it without changing it. Predictive suggestions apply only after explicit acceptance. UI selection chooses a trusted view, and **Use view** or a manual choice commits that view. Predictions use completion snapshots; UI selection uses whole TypeSafe decisions. UI Kits and UI chatbot begin without an accepted plan; an explicit acceptance creates one.

The onboarding lessons keep the first steps small. **First plan** streams a trusted preview without tools or acceptance. **Messages and turns** uses plain text to follow history. **System instructions** compares browser configuration with policy observed at the provider boundary. Their **State** views remain unchanged.

The workflow lessons use real text chat wrapped by the checked local AG-UI agent. **Shared state** separates local form edits from SDK state and agent updates. **Activities** reports context validation and provider completion, rather than claiming the plan steps ran. **Interrupt and resume** asks two approval questions, continues the same user turn, and gives the next turn a fresh batch. Their State, Activities, and Interrupts inspectors follow actual SDK observations. The accepted application plan stays separate.

The JavaScript runtime lesson executes visible application-owned scripts against the plan without a model request. Code, host calls and outcomes are captured together; estimates never apply a plan.

## Follow a Generative UI turn

1. Send the first prompt. `useUiChat` starts a real request.
2. The `readContext` browser tool returns the current plan and revision. Reading context does not change it.
3. Hashbrown sends the tool result in a continuation. The model selects the exposed `SummaryCard`.
4. The JSON inspector shows the response text as it arrives. Beside the captured response, the SDK's resolved values appear, and React renders those values in the trusted component.
5. Accept the plan after a successful response. This explicit action updates application state and advances its revision.

The next prompt stays in the conversation. Its tool call reads the accepted plan. A revised component is another proposal; rendering it does not apply it.

## Inspect and replay

The bottom player records user prompts, requests, decoded stream events, tool results, parsed output, completion, and acceptance. Press play, step by event or by turn, or drag anywhere on the track to any moment in the captured conversation. With focus outside a control, Space plays and pauses, the left and right arrows step by event, and Shift with an arrow moves by turn. Press L to return to live. These shortcuts leave links, inputs, tabs, readable panels, and resize controls to handle their own keys.

The chat, JSON, components, and application state all follow the same cursor. Playback uses immutable snapshots. It does not contact the provider, call a tool, or accept a plan. While you replay, the **LIVE** pill becomes **Return to live**. Choose it to continue the actual conversation.

The inspector has JSON, Requests, UI, and State tabs. A strip under the tabs names the selected event, its turn, time, and source. Every tab except Requests puts what was captured on one side and what the SDK or the app made of it on the other. They sit side by side when there is room and stack when there is not. The `{ }` toggle on the captured side shows the raw frame.

Use Tab to reach the active inspector tab. Left and right arrows switch views; Home and End go to the first and last view. Press Tab again to leave the tab strip and reach the panel controls or its readable content. The request-detail tabs use the same keys. Switching a view doesn't send a request or apply a plan.

Focus the bottom scrubber to use its native arrow, Home, and End keys. Its accessible value names the turn, event, milestone, and elapsed time. Status announcements follow lifecycle changes, such as loading or completion, rather than announcing every token.

The Requests tab opens with an overview timeline you can drag or click to seek, above a table of requests grouped by turn. Each row shows status, start, duration, events, and a waterfall, and tool calls sit under the request that called them. Select a request to open Overview, Messages, Tools, State, Raw request (as captured), and Response (every streamed event). Tool rows show Call, Result, and Raw. A failed HTTP request shows Overview and Raw. Press Escape or select **Close request detail** to go back to the table.

**New conversation** at the top of the sidebar starts an independent session; select a session under Conversations to return to it. The sidebar toggle (Cmd+B or Ctrl+B) collapses it to an icon rail. Sessions are kept in memory and clear on refresh.

## Read the code

- [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/Workbench.tsx): `useUiChat`, the browser tool, and the trusted component.
- [Shared capture model](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts): immutable frames and revision-checked acceptance.
- [Capturing transport](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-transport.ts): request and event capture without changing the SDK stream.
- [Server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts): bounded input and server-owned instructions, tools, and response schema.

Run `npx nx workbench-e2e www` to verify both SDK clients with deterministic HTTP events. The test report identifies this as `test-fixture`; it is not a live model run. The Decisions lesson additionally needs server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. It uses a fixed application-owned plan and complete decision responses, while the generation lessons use OpenAI and streaming.

Set `WORKBENCH_LIVE=1` with your server credentials and model to verify the real provider path. Source provenance is shown in the workbench and written to the verification report.

Continue with [Exposing components](/docs/react/concept/components), [Tool calling](/docs/react/concept/functions), or [Streaming](/docs/react/concept/streaming) to focus on one part of the conversation.

## Keep and Restore Completed Text

Open `/react.html?lesson=message-history` to keep, clear, and restore a completed exchange. The History inspector distinguishes the SDK transcript from the app's in-memory text copy. Open `/react.html?lesson=save-text-conversations` to save Lighthouse and Harbor explicitly, refresh, and load text into a new runtime.

Only successful completed text is saved. Browser slots do not restore shared state, activities, tools, or pending interrupts. The timeline after refresh starts a new capture; replay never requests or writes storage. See [Message history](/docs/react/concept/message-history) and [Save text conversations](/docs/react/recipes/browser-history).

## Add a chat screen with Threadplane

The [Threadplane walkthrough](/docs/react/recipes/threadplane) uses the same two-step plan in a separately installed application. Its recording keeps Threadplane's actual chat controls inside the canonical inspector and timeline. Inspect the streamed text, request history, and unchanged application state together.

Threadplane is an installed integration pair alongside the 28 bundled lessons. It isn't another `?lesson=` route in the hosted workbench. Follow the checked installation instructions to run the consumer locally.
