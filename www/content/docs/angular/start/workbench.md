---
title: 'Conversation Workbench: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Follow real requests, streamed JSON, trusted components, and application state through one conversation.'
---

# Conversation workbench

<hb-docs-demo demo="canonical-workbench-angular">
</hb-docs-demo>

I use one small example to follow a conversation from a prompt to a working interface. Ask for a two-step plan. Watch the JSON arrive, inspect the props, and accept the plan. Then ask for a shorter second step.

The Angular and React versions use the same example, styles, and capture model. Each version uses its own Hashbrown API and component renderer.

## Run the example

Try it without installing anything at [workbench.hashbrown.dev/angular.html](https://workbench.hashbrown.dev/angular.html). Each lesson's local URL in the table below works there too, for example `/angular.html?lesson=tools`. The hosted version runs the same server code with a rate limit per visitor. Server-owned threads and Public endpoints run only on the local server, because their demo sessions live in one process.

To run it yourself, clone the [Hashbrown repository](https://github.com/liveloveapp/hashbrown), install its dependencies, and set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment. Keep the key out of browser code.

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/angular.html`. The React version is available at `/react.html` on the same server.

The local server uses the real OpenAI adapter, keeps the model and output limit on the server, and cancels the provider request when the browser disconnects. It does not provide production identity, durable storage, or shared admission control.

## Choose one teaching focus

The collapsible sidebar opens twenty-eight lessons under Get started, Concepts, Production, and Recipes. All use the same two-step plan and keep the chat, the inspector, and the bottom player in view. Drag the handle between the chat and the inspector to resize them. Focus it and use the left and right arrow keys or Home, or double-click it to reset.

The lessons are:

| Lesson                                                                              | Local URL                                      | Follow                                                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| [First plan](/docs/angular/start/quick)                                             | `/angular.html?lesson=first-plan`              | One tool-free request and a trusted preview; no application write.         |
| [Messages and turns](/docs/angular/concept/ai-basics)                               | `/angular.html?lesson=conversation`            | Retained messages, stable thread identity and fresh run identity.          |
| [System instructions](/docs/angular/concept/system-instructions)                    | `/angular.html?lesson=system-instructions`     | Browser declaration and public effective policy at provider mapping.       |
| [Generative UI](/docs/angular/concept/components)                                   | `/angular.html?lesson=generative-ui`           | Streamed props and the trusted SummaryCard.                                |
| [Tools](/docs/angular/concept/functions)                                            | `/angular.html?lesson=tools`                   | Browser context, tool result, and continuation.                            |
| [Structured output](/docs/angular/concept/structured-output)                        | `/angular.html?lesson=structured-output`       | Plain typed plan data rendered by the application.                         |
| [Streaming](/docs/angular/concept/streaming)                                        | `/angular.html?lesson=streaming`               | Partial title text and resolved steps.                                     |
| [Schemas](/docs/angular/concept/schema)                                             | `/angular.html?lesson=schemas`                 | The exact response contract and application validation.                    |
| [Decisions](/docs/angular/concept/decisions)                                        | `/angular.html?lesson=decisions`               | Complete typed choices, confidence and explicit application.               |
| [Debugging](/docs/angular/concept/debugging)                                        | `/angular.html?lesson=debugging`               | Local HTTP denial, same-conversation recovery, and captured evidence.      |
| [Request transformation](/docs/angular/concept/transform-request-options)           | `/angular.html?lesson=request-transformation`  | Actual server callback, added instructions, and preserved provider fields. |
| [Magic Text](/docs/angular/recipes/magic-text)                                      | `/angular.html?lesson=magic-text`              | Streamed Markdown and actual source-reference selection.                   |
| [Predictive suggestions](/docs/angular/recipes/predictive-actions)                  | `/angular.html?lesson=predictions`             | Current-context completions and explicit acceptance or dismissal.          |
| [UI selection](/docs/angular/recipes/ui-selection)                                  | `/angular.html?lesson=ui-selection`            | Whole candidate decisions, app-owned views, and manual choice.             |
| [Shared agent state](/docs/angular/concept/shared-agent-state)                      | `/angular.html?lesson=shared-state`            | Explicit local state replacement, agent drafts, commit, and rollback.      |
| [Activities](/docs/angular/concept/activities)                                      | `/angular.html?lesson=activities`              | Actual agent progress messages, links, and fresh activity IDs.             |
| [Interrupt and resume](/docs/angular/concept/interrupt-and-resume)                  | `/angular.html?lesson=interrupts`              | Complete approval batches and continuation within the same user turn.      |
| [Message history](/docs/angular/concept/message-history)                            | `/angular.html?lesson=message-history`         | Keep completed text, clear SDK history, restore and continue.              |
| [Save text conversations](/docs/angular/recipes/browser-history)                    | `/angular.html?lesson=save-text-conversations` | Explicit browser saves, hard refresh and validated text loading.           |
| [Server-owned threads](/docs/angular/recipes/threads)                               | `/angular.html?lesson=server-threads`          | Explicit server saves, refresh and version conflicts.                      |
| [Public endpoints](/docs/angular/recipes/public-endpoint)                           | `/angular.html?lesson=public-endpoint`         | Identity and ownership checks before provider work.                        |
| [Decisions in agents](/docs/angular/recipes/decisions-in-agents)                    | `/angular.html?lesson=agent-decisions`         | Server route decisions and fixed read-only handlers.                       |
| [JSON parser](/docs/angular/recipes/json-parser)                                    | `/angular.html?lesson=json-parser`             | Raw JSON, real parser values and final document validation.                |
| [Natural language forms](/docs/angular/recipes/natural-language-to-structured-data) | `/angular.html?lesson=natural-forms`           | Review, edit and explicitly apply a generated draft.                       |
| [UI Kits](/docs/angular/recipes/ui-kits)                                            | `/angular.html?lesson=ui-kits`                 | Actual kit registry, trusted variants, and explicit acceptance.            |
| [UI chatbot](/docs/angular/recipes/ui-chatbot)                                      | `/angular.html?lesson=ui-chatbot`              | A proposal, accepted state, and a read-only follow-up.                     |
| [JavaScript runtime](/docs/angular/concept/runtime)                                 | `/angular.html?lesson=javascript-runtime`      | Actual QuickJS code, validated host calls, results and errors.             |
| [Local models](/docs/angular/recipes/local-models)                                  | `/angular.html?lesson=local-models`            | Native model preparation, local structured chat and explicit acceptance.   |

Selecting a lesson opens a fresh local page; it does not send a request. Conversations remain in memory within the current page. The player's scrubber shows meaningful milestones by default. Choose **Raw events** to put every captured stream frame on the scrubber.

Magic Text, predictive suggestions, and UI selection begin with the same application-owned plan at revision zero. Magic Text explains it without changing it. Predictive suggestions apply only after explicit acceptance. UI selection chooses a trusted view, and **Use view** or a manual choice commits that view. Predictions use completion snapshots; UI selection uses whole TypeSafe decisions. UI Kits and UI chatbot begin without an accepted plan; an explicit acceptance creates one.

The onboarding lessons keep the first steps small. **First plan** streams a trusted preview without tools or acceptance. **Messages and turns** uses plain text to follow history. **System instructions** compares browser configuration with policy observed at the provider boundary. Their **State** views remain unchanged.

The workflow lessons use real text chat wrapped by the checked local AG-UI agent. **Shared state** separates local form edits from SDK state and agent updates. **Activities** reports context validation and provider completion, rather than claiming the plan steps ran. **Interrupt and resume** asks two approval questions, continues the same user turn, and gives the next turn a fresh batch. Their State, Activities, and Interrupts inspectors follow actual SDK observations. The accepted application plan stays separate.

The JavaScript runtime lesson executes visible application-owned scripts against the plan without a model request. Code, host calls and outcomes are captured together; estimates never apply a plan.

## Follow a Generative UI turn

1. Send the first prompt. `uiChatResource` starts a real request.
2. The `readContext` browser tool returns the current plan and revision. Reading context does not change it.
3. Hashbrown sends the tool result in a continuation. The model selects the exposed `SummaryCard`.
4. The JSON inspector shows the response text as it arrives. Beside the captured response, the SDK's resolved values appear, and Angular renders those values in the trusted component.
5. Accept the plan after a successful response. This explicit action updates application state and advances its revision.

The next prompt stays in the conversation. Its tool call reads the accepted plan. A revised component is another proposal; rendering it does not apply it.

## Inspect and replay

The bottom player records user prompts, requests, decoded stream events, tool results, parsed output, completion, and acceptance. Press play, step by event or by turn, or drag anywhere on the track to any moment in the captured conversation. Space plays and pauses, and the arrow keys step.

The chat, JSON, components, and application state all follow the same cursor. Playback uses immutable snapshots. It does not contact the provider, call a tool, or accept a plan. While you replay, the **LIVE** pill becomes **Return to live**. Choose it to continue the actual conversation.

The inspector has JSON, Requests, UI, and State tabs. A strip under the tabs names the selected event, its turn, time, and source. Every tab except Requests puts what was captured on one side and what the SDK or the app made of it on the other. They sit side by side when there is room and stack when there is not. The `{ }` toggle on the captured side shows the raw frame.

The Requests tab opens with an overview timeline you can drag or click to seek, above a table of requests grouped by turn. Each row shows status, start, duration, events, and a waterfall, and tool calls sit under the request that called them. Select a request to open Overview, Messages, Tools, State, Raw request (as captured), and Response (every streamed event). Tool rows show Call, Result, and Raw. A failed HTTP request shows Overview and Raw. Press Escape or select **Close request detail** to go back to the table.

**New conversation** at the top of the sidebar starts an independent session; select a session under Conversations to return to it. The sidebar toggle (Cmd+B or Ctrl+B) collapses it to an icon rail. Sessions are kept in memory and clear on refresh.

## Read the code

- [Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workbench.ts): `uiChatResource`, the browser tool, and the trusted component.
- [Shared capture model](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts): immutable frames and revision-checked acceptance.
- [Capturing transport](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-transport.ts): request and event capture without changing the SDK stream.
- [Server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts): bounded input and server-owned instructions, tools, and response schema.

Run `npx nx workbench-e2e www` to verify both SDK clients with deterministic HTTP events. The test report identifies this as `test-fixture`; it is not a live model run. The Decisions lesson additionally needs server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. It uses a fixed application-owned plan and complete decision responses, while the generation lessons use OpenAI and streaming.

Set `WORKBENCH_LIVE=1` with your server credentials and model to verify the real provider path. Source provenance is shown in the workbench and written to the verification report.

Continue with [Exposing components](/docs/angular/concept/components), [Tool calling](/docs/angular/concept/functions), or [Streaming](/docs/angular/concept/streaming) to focus on one part of the conversation.

## Keep and Restore Completed Text

Open `/angular.html?lesson=message-history` to keep, clear, and restore a completed exchange. The History inspector distinguishes the SDK transcript from the app's in-memory text copy. Open `/angular.html?lesson=save-text-conversations` to save Lighthouse and Harbor explicitly, refresh, and load text into a new runtime.

Only successful completed text is saved. Browser slots do not restore shared state, activities, tools, or pending interrupts. The timeline after refresh starts a new capture; replay never requests or writes storage. See [Message history](/docs/angular/concept/message-history) and [Save text conversations](/docs/angular/recipes/browser-history).
