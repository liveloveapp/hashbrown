---
title: 'Generative UI with Angular Components: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Expose a trusted plan component and follow its props as the model streams.'
---

# Generative UI with Angular components

<hb-docs-demo demo="canonical-workbench-ui-angular">
</hb-docs-demo>

Let’s build a two-step plan. We will give the model one component, `SummaryCard`, and describe the props it accepts. As the response arrives, Hashbrown parses the JSON and renders our component.

I use the same plan in [Tools](/docs/angular/concept/functions) and [Structured output](/docs/angular/concept/structured-output). Here, we’ll focus on how a model selects a component and supplies its props.

## Run the same conversation

Use the [conversation workbench](/docs/angular/start/workbench) with the server environment from the [Quickstart](/docs/angular/start/quick). Start it with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=generative-ui`. Selecting a lesson does not send a request.

The recording uses this checked Angular client with real provider requests. The local server keeps credentials, instructions, tools, and response schema on the server. Refresh clears the in-memory conversations and accepted plan.

## Expose one trusted component

`SummaryCard` is ordinary application code: a title, an ordered list, and an **Accept plan** button. We expose that existing component with a stable name, a description, and a schema. The model chooses from this catalog; it does not write executable component code.

The following excerpt is from the checked workbench client. Open the complete client for the component implementation, application state, and acceptance guard.

<hb-code-example header="angular/src/app/workbench.ts">

```ts
const components = [
  exposeComponent(SummaryCard, {
    name: 'SummaryCard',
    description:
      'Propose a concise plan for explicit user review and acceptance.',
    input: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A clear, concise action'),
      ),
    },
    children: false,
  }),
];
```

</hb-code-example>

[`exposeComponent()`](/api/angular/exposeComponent) connects the schema to the component’s inputs. A mismatched type is a build error. `children: false` disallows nested components; larger catalogs can allow children explicitly.

## Watch the props arrive

The title uses an ordinary `s.string`. The steps use `s.streaming.array`, so resolved items can appear while the response is still arriving. Select **JSON** to follow the raw response, then **UI** to inspect resolved props. The rightmost **Details** view follows that selection.

A partial value is useful feedback. It is still a preview. The workbench enables **Accept plan** only after a fresh, successfully completed response passes its two-step plan rules. Rendering the card does not update the accepted plan.

<img src="/video/docs/canonical-workbench-ui-angular-result.png" alt="The canonical plan appears in the chat beside its captured JSON and resolved component props." width="1600" height="1000" loading="lazy" />

## Start and render the conversation

The checked client passes the catalog, `readContext` tool, system instruction, and capturing transport to `uiChatResource()`. The [Quickstart](/docs/angular/start/quick) shows the smaller tool-free setup; this lesson adds context and explicit acceptance.

The conversation renders each assistant message through `<hb-render-message [message]="message()" />`. Keep the complete message history for follow-up turns.

[Read the checked client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workbench.ts). The workbench shell records requests and parsed output; Angular owns the live component renderer.

## Follow the second turn

Send the first prompt and select **Accept plan**. In **State**, the application revision advances from `0` to `1`. Then choose **Follow-up** and send “Make the second step shorter.” The tool reads the accepted plan before the model proposes its revision.

Use the bottom timeline to revisit the first streamed JSON, parsed output, or acceptance. The chat, inspector, and state follow the same captured moment. **Raw events** reveals every frame; playback makes no provider requests and cannot accept a plan.

## Grow the component catalog

Use descriptions that explain when a component is useful and what its props mean. Keep names stable. If the layout accepts children, use `children: 'any'` for any exposed child, or provide an explicit collection of exposed components. Those children still come from your trusted catalog.

Skillet also accepts its supported Standard JSON Schema inputs. Read [Skillet schemas](/docs/angular/concept/schema) before substituting another schema library; unsupported constructs are rejected.

## Next steps

Continue with [Tools](/docs/angular/concept/functions) to inspect `readContext`, or [Structured output](/docs/angular/concept/structured-output) to return the same plan as typed data. See [Streaming](/docs/angular/concept/streaming) for string, array, and object streaming, and the [`uiChatResource()` API](/api/angular/uiChatResource) for the complete options.
