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

The left navigation opens three lessons. All use the same two-step plan and keep the chat, inspector, contextual panel, and bottom timeline visible:

| Lesson | Local URL | Follow |
| --- | --- | --- |
| [Generative UI](/docs/react/concept/components) | `/react.html?lesson=generative-ui` | Streamed props and the trusted SummaryCard. |
| [Tools](/docs/react/concept/functions) | `/react.html?lesson=tools` | Browser context, tool result, and continuation. |
| [Structured output](/docs/react/concept/structured-output) | `/react.html?lesson=structured-output` | Plain typed plan data rendered by the application. |

Selecting a lesson opens a fresh local page; it does not send a request. Conversations remain in memory within the current page. The timeline shows meaningful milestones by default. Choose **Raw events** to inspect every captured stream frame.

## Follow one turn

1. Send the first prompt. `useUiChat` starts a real request.
2. The `readContext` browser tool returns the current plan and revision. Reading context does not change it.
3. Hashbrown sends the tool result in a continuation. The model selects the exposed `SummaryCard`.
4. The JSON inspector shows the response text as it arrives. The Details view shows values resolved by the SDK, and React renders those values in the trusted component.
5. Accept the plan after a successful response. This explicit action updates application state and advances its revision.

The next prompt stays in the conversation. Its tool call reads the accepted plan. A revised component is another proposal; rendering it does not apply it.

## Inspect and replay

The bottom timeline records user prompts, requests, decoded stream events, tool results, parsed output, completion, and acceptance. Select an event, step backward or forward, choose a turn, or play the captured conversation.

The chat, JSON, components, and application state all follow the same cursor. Playback uses immutable snapshots. It does not contact the provider, call a tool, or accept a plan. Choose **Return to live** to continue the actual conversation.

The inspector has JSON, Requests, UI, and State views on light code surfaces. Select a request or tool row to inspect its captured payload. The far-right panel follows the selection, with Details, Raw, and Console views. **New conversation** starts an independent session; use the left navigation to return to another session. Sessions are kept in memory and clear on refresh.

## Read the code

- [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/Workbench.tsx): `useUiChat`, the browser tool, and the trusted component.
- [Shared capture model](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts): immutable frames and revision-checked acceptance.
- [Capturing transport](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-transport.ts): request and event capture without changing the SDK stream.
- [Server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-app.ts): bounded input and server-owned instructions, tools, and response schema.

Run `npx nx workbench-e2e www` to verify both SDK clients with deterministic HTTP events. The test report identifies this as `test-fixture`; it is not a live model run. Set `WORKBENCH_LIVE=1` with your server credentials and model to verify the real provider path. Source provenance is shown in the workbench and written to the verification report.

Continue with [Exposing components](/docs/react/concept/components), [Tool calling](/docs/react/concept/functions), or [Streaming](/docs/react/concept/streaming) to focus on one part of the conversation.
