---
title: 'Conversation Workbench: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow real requests, streamed JSON, trusted components, and application state through one conversation.'
---

# Conversation workbench

<hb-docs-demo demo="canonical-workbench-react">
</hb-docs-demo>

I use one small example to follow a conversation from a prompt to a working interface. Ask for a two-step plan. Watch the JSON arrive, inspect the props, and accept the plan. Then ask for a shorter second step.

The React and Angular versions use the same example, styles, and capture model. Each version uses its own Hashbrown API and component renderer.

## Run the example

Clone the [Hashbrown repository](https://github.com/liveloveapp/hashbrown), install its dependencies, and set `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment. Keep the key out of browser code.

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/react.html`. The Angular version is available at `/angular.html` on the same server.

This is a local development server. It uses the real OpenAI adapter, keeps the model and output limit on the server, and cancels the provider request when the browser disconnects. It does not provide production identity, durable storage, or shared admission control.

## Choose one teaching focus

The collapsible sidebar opens eleven lessons under Concepts, Production, and Recipes. All use the same two-step plan and keep the chat, the inspector, and the bottom player in view. Drag the handle between the chat and the inspector to resize them. Focus it and use the arrow keys, or double-click it to reset:

| Lesson                                                                  | Local URL                                   | Follow                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| [Generative UI](/docs/react/concept/components)                         | `/react.html?lesson=generative-ui`          | Streamed props and the trusted SummaryCard.                                |
| [Tools](/docs/react/concept/functions)                                  | `/react.html?lesson=tools`                  | Browser context, tool result, and continuation.                            |
| [Structured output](/docs/react/concept/structured-output)              | `/react.html?lesson=structured-output`      | Plain typed plan data rendered by the application.                         |
| [Streaming](/docs/react/concept/streaming)                              | `/react.html?lesson=streaming`              | Partial title text and resolved steps.                                     |
| [Schemas](/docs/react/concept/schema)                                   | `/react.html?lesson=schemas`                | The exact response contract and application validation.                    |
| [Decisions](/docs/react/concept/decisions)                              | `/react.html?lesson=decisions`              | Complete typed choices, confidence and explicit application.               |
| [Debugging](/docs/react/concept/debugging)                              | `/react.html?lesson=debugging`              | Local HTTP denial, same-conversation recovery, and captured evidence.      |
| [Request transformation](/docs/react/concept/transform-request-options) | `/react.html?lesson=request-transformation` | Actual server callback, added instructions, and preserved provider fields. |
| [Magic Text](/docs/react/recipes/magic-text)                            | `/react.html?lesson=magic-text`             | Streamed Markdown and actual source-reference selection.                   |
| [Predictive suggestions](/docs/react/recipes/predictive-actions)        | `/react.html?lesson=predictions`            | Current-context completions and explicit acceptance or dismissal.          |
| [UI selection](/docs/react/recipes/ui-selection)                        | `/react.html?lesson=ui-selection`           | Whole candidate decisions, app-owned views, and manual choice.             |

Selecting a lesson opens a fresh local page; it does not send a request. Conversations remain in memory within the current page. The player's scrubber shows meaningful milestones by default. Choose **Raw events** to put every captured stream frame on the scrubber.

The recipe lessons begin with the same application-owned plan at revision zero. Magic Text explains it without changing it. Predictive suggestions apply only after explicit acceptance. UI selection chooses a trusted view, and **Use view** or a manual choice commits that view. Predictions use completion snapshots; UI selection uses whole TypeSafe decisions.

## Follow a Generative UI turn

1. Send the first prompt. `useUiChat` starts a real request.
2. The `readContext` browser tool returns the current plan and revision. Reading context does not change it.
3. Hashbrown sends the tool result in a continuation. The model selects the exposed `SummaryCard`.
4. The JSON inspector shows the response text as it arrives. Beside the captured response, the SDK's resolved values appear, and React renders those values in the trusted component.
5. Accept the plan after a successful response. This explicit action updates application state and advances its revision.

The next prompt stays in the conversation. Its tool call reads the accepted plan. A revised component is another proposal; rendering it does not apply it.

## Inspect and replay

The bottom player records user prompts, requests, decoded stream events, tool results, parsed output, completion, and acceptance. Press play, step by event or by turn, or drag the scrubber to any moment in the captured conversation. Space plays and pauses, and the arrow keys step.

The chat, JSON, components, and application state all follow the same cursor. Playback uses immutable snapshots. It does not contact the provider, call a tool, or accept a plan. While you replay, the **LIVE** pill becomes **Return to live**. Choose it to continue the actual conversation.

The inspector has JSON, Requests, UI, and State tabs. A strip under the tabs names the selected event, its turn, time, and source. Each tab puts what was captured on one side and what the SDK or the app made of it on the other. They sit side by side when there is room and stack when there is not. Select a request or tool row to inspect its captured payload. The `{ }` toggle on the captured side shows the raw frame. **New conversation** at the top of the sidebar starts an independent session; select it under Conversations to return to it. The sidebar toggle (Cmd+B or Ctrl+B) collapses it to an icon rail. Sessions are kept in memory and clear on refresh.

## Read the code

- [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/Workbench.tsx): `useUiChat`, the browser tool, and the trusted component.
- [Shared capture model](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts): immutable frames and revision-checked acceptance.
- [Capturing transport](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-transport.ts): request and event capture without changing the SDK stream.
- [Server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts): bounded input and server-owned instructions, tools, and response schema.

Run `npx nx workbench-e2e www` to verify both SDK clients with deterministic HTTP events. The test report identifies this as `test-fixture`; it is not a live model run. The Decisions lesson additionally needs server-only `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. It uses a fixed application-owned plan and complete decision responses, while the generation lessons use OpenAI and streaming.

Set `WORKBENCH_LIVE=1` with your server credentials and model to verify the real provider path. Source provenance is shown in the workbench and written to the verification report.

Continue with [Exposing components](/docs/react/concept/components), [Tool calling](/docs/react/concept/functions), or [Streaming](/docs/react/concept/streaming) to focus on one part of the conversation.
