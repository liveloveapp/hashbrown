---
title: 'Build a Generative UI Chatbot: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Propose a two-step plan, explicitly accept it, and read the accepted state in a second Angular conversation turn.'
---

# Build a generative UI conversation

Let's give our conversation something to work with. The assistant will propose a two-step plan. We'll accept it, then ask the assistant to read the plan we accepted. One turn proposes a change; the next reports application state.

<hb-docs-demo demo="canonical-workbench-ui-chatbot-angular">
</hb-docs-demo>

<img src="/video/docs/canonical-workbench-ui-chatbot-angular-result.png" alt="The Angular conversation shows an accepted SummaryCard followed by a read-only PlanReading, beside the application plan and revision." width="1600" height="1000" loading="lazy" />

## Follow both turns

1. Open **UI chatbot** in the [canonical workbench](/docs/angular/start/workbench).
2. Send the first prompt. `readContext` returns the current application plan and revision without changing them.
3. Review the generated `SummaryCard`. Its appearance does not accept the proposal.
4. Select **Accept plan** after successful completion and validation. **State** now shows the accepted plan at revision one.
5. Send the follow-up asking for the plan you accepted. Inspect the next tool result: it contains that actual plan and revision.
6. Read the generated `PlanReading`. It has no Accept action and leaves the revision unchanged.

Both Angular turns use real Hashbrown UI chat, browser tools, trusted component rendering, and OpenAI responses. The recorded model output is not supplied by a local fixture.

## Keep the responsibilities clear

| Boundary            | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| Model               | Selects an exposed component and proposes its schema-constrained props.       |
| `readContext`       | Returns the actual accepted plan and revision.                                |
| `SummaryCard`       | Presents a proposal with an explicit, guarded application action.             |
| Accept handler      | Validates the current completed response and advances application state once. |
| `PlanReading`       | Displays a read-only model report.                                            |
| **State** inspector | Shows authoritative application values.                                       |

A tool result gives the model context. It does not guarantee that the model will report every value correctly. Compare the reading with **State** when debugging. A read-only component must remain read-only even if a response arrives late or an old turn is selected.

## Use one kit for the conversation

The [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/ui-kit-workbench.ts) packages `SummaryCard` and `PlanReading` with `createUiKit()` and passes the kit to `uiChatResource()`. The component descriptions distinguish a proposed plan from a report of an accepted plan.

The composition point is small:

```ts
import { createUiKit, uiChatResource } from '@hashbrownai/angular';

const kit = createUiKit({ components: exposedComponents });
const chat = uiChatResource({
  system: instructions,
  components: [kit],
  tools: [readContext],
  transport,
});
```

The complete client defines `exposedComponents`, the fixed `instructions`, `readContext`, and `transport`. Create the resource in an Angular injection context, as the session service does.

The server fixes the instructions, output schema, and read-only tool catalog. It does not trust a browser-supplied system message to define that policy. Keep provider credentials on the server.

The application owns acceptance. The handler requires a current successful source, a valid original document, matching props and component, the current turn and revision, and an unused proposal. Replay, stopped or failed requests, stale cards, and `PlanReading` cannot apply a plan.

## Inspect and replay

Use **Requests** to compare the two tool calls. Use **Kit** and **Schema** to inspect what the model can render. **UI** follows the selected component; **State** follows the accepted plan.

The bottom timeline keeps captured requests, JSON, components, and state together. Replay makes no provider requests or application writes. These local captures clear on refresh; this example does not save an agent checkpoint.

## Require the context step

An instruction alone does not guarantee that a model will call a tool. In this example, the server requires `readContext` before allowing a UI response. Once a successful context result belongs to the current turn, it disables further tool calls for that response.

This is the example's server policy, implemented through the OpenAI adapter. It is not automatic behavior supplied by a kit or a chat hook.

## Read the checked source

- [Server-enforced context sequence](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-ui-policy.ts).
- [Angular conversation, trusted components, and lifecycle](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/ui-kit-workbench.ts).
- [Shared kit contracts and lesson policy](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-ui-kits.ts).
- [Capture and explicit acceptance](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts).

Use [UI Kits](/docs/angular/recipes/ui-kits) to package reusable components. Use [Natural language forms](/docs/angular/recipes/natural-language-to-structured-data) when the user should edit generated fields before applying them. For saved text, continue with [Message history](/docs/angular/concept/message-history).
