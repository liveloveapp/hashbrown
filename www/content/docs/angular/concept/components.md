---
title: 'Generative UI with Angular Components: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose trusted application components with a model and render their typed inputs.'
---

# Generative UI with Angular components

Generative UI lets a model choose from components your application already owns. You describe each component and its inputs; Hashbrown turns the model’s structured response into those trusted components. The model supplies data and layout choices. Your code still owns rendering, events, and access to application services.

Use it when different requests need different presentations: a product comparison, a summary card, or a small dashboard. If every answer uses the same layout, [structured output](/docs/angular/concept/structured-output) is often enough. Start with one useful component, then grow the catalog when the feature needs another way to present information.

<hb-diagram diagram="concept-trusted-components"> </hb-diagram>

## Expose a useful summary card

Use the endpoint and client configuration from the [Quickstart](/docs/angular/start/quick). Keep `provideHashbrown` in `appConfig` and the `<app-root>` host. Import the standalone class below into `main.ts` and pass it to `bootstrapApplication()` with that same `appConfig`.

This complete example defines the card, exposes its two text fields, and renders assistant output. The fields are text bindings, so the model cannot inject component code or HTML. No tool or application write is involved.

```ts
import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';

@Component({
  selector: 'app-book-card',
  template: `<article>
    <h2>{{ title() }}</h2>
    <p>{{ summary() }}</p>
  </article>`,
})
export class BookCard {
  readonly title = input.required<string>();
  readonly summary = input.required<string>();
}

const components = [
  exposeComponent(BookCard, {
    name: 'BookCard',
    description: 'Summarize a book with its title and a short explanation.',
    input: {
      title: s.string('The book title'),
      summary: s.string('A short plain-text summary'),
    },
    children: false,
  }),
];

@Component({
  selector: 'app-root',
  imports: [RenderMessageComponent],
  template: `
    <button type="button" [disabled]="chat.isLoading()" (click)="summarize()">
      Summarize
    </button>
    @if (chat.error()) {
      <p role="alert">The request failed.</p>
    }
    @for (message of chat.value(); track $index) {
      @if (message.role === 'assistant') {
        <hb-render-message [message]="message" />
      }
    }
  `,
})
export class BookSummary {
  readonly chat = uiChatResource({
    system: 'Summarize books using one BookCard. Keep summaries concise.',
    components,
  });
  summarize(): void {
    this.chat.sendMessage({
      role: 'user',
      content: 'Summarize Pride and Prejudice.',
    });
  }
}
```

`children: false` keeps the catalog flat. Give each component a stable name and describe when it is useful. If a component performs a mutation, its event handler must check current state and permission independently of the generated props.

## Explore it in the workbench

<hb-workbench lesson="generative-ui">
</hb-workbench>

Let’s build a two-step plan. We will give the model one component, `SummaryCard`, and describe the props it accepts. As the response arrives, Hashbrown parses the JSON and renders our component.

I use the same plan in [Tools](/docs/angular/concept/functions) and [Structured output](/docs/angular/concept/structured-output). Here, we’ll focus on how a model selects a component and supplies its props.

### Run the same conversation

Use the [conversation workbench](/docs/angular/start/workbench) with the server environment from the [Quickstart](/docs/angular/start/quick). Start it with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=generative-ui`. Selecting a lesson does not send a request.

The recording uses this checked Angular client with real provider requests. The local server keeps credentials, instructions, tools, and response schema on the server. Refresh clears the in-memory conversations and accepted plan.

### Expose one trusted component

`SummaryCard` is ordinary application code: a title, an ordered list, and an **Accept plan** button. We expose that existing component with a stable name, a description, and a schema. The model chooses from this catalog; it does not write executable component code.

The following excerpt is from the checked workbench client. Open the complete client for the component implementation, application state, and acceptance guard.

<hb-code-example header="angular/src/app/workbench.ts" moment="parsed-output-1">

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

### Watch the props arrive

The title uses an ordinary `s.string`. The steps use `s.streaming.array`, so resolved items can appear while the response is still arriving. Select **JSON** to follow the raw response, then **UI** to inspect resolved props. The **Resolved props** section follows that selection.

A partial value is useful feedback. It is still a preview. The workbench enables **Accept plan** only after a fresh, successfully completed response passes its two-step plan rules. Rendering the card does not update the accepted plan.

<img src="/video/docs/canonical-workbench-ui-angular-result.png" alt="The canonical plan appears in the chat beside its captured JSON and resolved component props." width="1600" height="1000" loading="lazy" />

### Start and render the conversation

The checked client passes the catalog, `readContext` tool, system instruction, and capturing transport to `uiChatResource()`. The [Quickstart](/docs/angular/start/quick) shows the smaller tool-free setup; this lesson adds context and explicit acceptance.

The conversation renders each assistant message through `<hb-render-message [message]="message()" />`. Keep the complete message history for follow-up turns.

[Read the checked client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/workbench.ts). The workbench shell records requests and parsed output; Angular owns the live component renderer.

### Follow the second turn

Send the first prompt and select **Accept plan**. In **State**, the application revision advances from `0` to `1`. Then choose **Follow-up** and send “Make the second step shorter.” The tool reads the accepted plan before the model proposes its revision.

Use the bottom player to revisit the first streamed JSON, parsed output, or acceptance. The chat, inspector, and state follow the same captured moment. **Raw events** puts every frame on the scrubber; playback makes no provider requests and cannot accept a plan.

### Grow the component catalog

Use descriptions that explain when a component is useful and what its props mean. Keep names stable. If the layout accepts children, use `children: 'any'` for any exposed child, or provide an explicit collection of exposed components. Those children still come from your trusted catalog.

Skillet also accepts its supported Standard JSON Schema inputs. Read [Skillet schemas](/docs/angular/concept/schema) before substituting another schema library; unsupported constructs are rejected.

### Next steps

Continue with [Tools](/docs/angular/concept/functions) to inspect `readContext`, or [Structured output](/docs/angular/concept/structured-output) to return the same plan as typed data. See [Streaming](/docs/angular/concept/streaming) for string, array, and object streaming, and the [`uiChatResource()` API](/api/angular/uiChatResource) for the complete options.
