---
title: 'UI Selection: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose which Angular components to show for an input, or narrow a chat, with a decision.'
---

# UI Selection

<p class="subtitle">Choose which Angular components to show for an input, or narrow a chat, with a decision.</p>

1. Describe each option in plain language.
2. The @hashbrownai/angular!uiDecisionResource:function resource asks a decision model which option fits the input.
3. Render only the options it chooses, or let a chat answer with only the components it chooses.

---

## Two Modes

uiDecisionResource has two modes. Which one you get depends on the options you pass.

| Mode       | You pass                      | The model chooses                              | Who fills in props |
| ---------- | ----------------------------- | ---------------------------------------------- | ------------------ |
| Candidates | `input` and `candidates`      | Among components your code has already built   | Your code          |
| Chat       | `chat`, from `uiChatResource` | Which of the chat's components fit the message | The chat, as usual |

Both modes take these options:

| Option          | Required | What it does                                                                                                |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `select`        | Yes      | `'one'` chooses one option, and `{ max: 3 }` chooses up to three.                                           |
| `minConfidence` | No       | The confidence needed to act on the choice. Defaults to 0.                                                  |
| `system`        | No       | Context for the decision model: what your app is and what the input means. Accepts a signal.                |
| `optionOrder`   | No       | `'shuffled'` varies the order of the options on every request, to spread the model's bias toward the first. |
| `transport`     | No       | Overrides the provider's decision transport. In chat mode, the chat keeps its own transport.                |

The resource requires `provideHashbrown` and an injection context. Set up the decision endpoint as described in [Decisions](/docs/angular/concept/decisions).

---

## Candidates Mode

Use candidates when your code already knows what each option shows. The model never writes props. It only picks.

Candidates mode also takes these options:

| Option       | Required | What it does                                                                          |
| ------------ | -------- | ------------------------------------------------------------------------------------- |
| `input`      | Yes      | A signal of the input to decide about. `null` or `undefined` keeps the resource idle. |
| `candidates` | Yes      | The components the model chooses from.                                                |
| `debounce`   | No       | Waits for the input to settle before deciding. Changing `system` asks again.          |

<hb-code-example header="choose among candidates">

```ts
import { Component, computed, input } from '@angular/core';
import { UiDecisionComponent, uiDecisionResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-answer',
  imports: [UiDecisionComponent],
  template: `<hb-ui-decision [resource]="answer" />`,
})
export class AnswerComponent {
  readonly query = input('');
  readonly callsign = input('UAL123');

  readonly answer = uiDecisionResource({
    input: computed(() => (this.query() === '' ? null : this.query())),
    select: 'one',
    minConfidence: 0.7,
    candidates: [
      {
        id: 'flight',
        description: 'The user asks about one aircraft',
        component: FlightCardComponent,
        inputs: computed(() => ({ callsign: this.callsign() })),
      },
      {
        id: 'airport',
        description: 'The user asks about an airport',
        component: AirportCardComponent,
      },
    ],
  });
}
```

</hb-code-example>

1. Each candidate has a unique `id` that is not empty and has no `.`, a `description` that tells the model when it fits, a `component`, and optional `inputs`. `inputs` is a plain object or a signal of one. A signal keeps the rendered component in step with app state: when it changes, the chosen component re-renders with the new inputs and no new decision is made. The `id` and `description` stay fixed.
2. `<hb-ui-decision [resource]>` renders the chosen components in order. `ids()` and `chosen()` hold what was picked.
3. Candidates mode renders nothing while the decision is pending, when there are no candidates, and when confidence is below `minConfidence`.

With `select: 'one'`, confidence is the model's confidence in its pick. With `{ max }`, each candidate is a yes or no question. Candidates at 0.5 probability or higher are kept, sorted by probability, and capped at `max`. `minConfidence` is compared to the best probability.

---

## Narrowing a Chat

Use chat mode when a chat writes the answer and you want each answer to use only the components that fit the message. The app keeps its own chat, with its own system prompt and tools, and sends messages through the resource instead. A decision first picks from the chat's components. Then the chat answers, seeing only the chosen components. This keeps the prompt small and the choices focused.

<hb-code-example header="narrow a chat">

```ts
import { Component, inject } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
  uiDecisionResource,
} from '@hashbrownai/angular';

@Component({
  selector: 'app-assistant',
  imports: [RenderMessageComponent, ComposerComponent],
  template: `
    @for (message of chat.value(); track $index) {
      @if (message.role === 'assistant') {
        <hb-render-message [message]="message" />
      } @else if (message.role === 'user') {
        <p>{{ message.content }}</p>
      }
    }
    <app-composer
      [disabled]="narrowing.isDeciding()"
      (send)="narrowing.sendMessage($event)"
    />
  `,
})
export class AssistantComponent {
  // 1. The app's own chat: its system prompt, components and tools.
  readonly chat = uiChatResource({
    system:
      'Answer questions about live flights. Use the cards to show results.',
    tools: [
      createTool({
        name: 'getFlights',
        description: 'Get the flights near an airport',
        schema: s.object('Airport', {
          ident: s.string('The airport identifier'),
        }),
        handler: ({ ident }) => inject(FlightService).near(ident),
      }),
    ],
    components: [
      exposeComponent(FlightCardComponent, {
        name: 'FlightCard',
        description: 'Shows one aircraft',
        input: { callsign: s.string('The aircraft callsign') },
      }),
      exposeComponent(AirportCardComponent, {
        name: 'AirportCard',
        description: 'Shows an airport',
        input: { ident: s.string('The airport identifier') },
      }),
    ],
  });

  // 2. Narrows the chat's components for each message.
  readonly narrowing = uiDecisionResource({
    chat: this.chat,
    select: { max: 2 },
    minConfidence: 0.7,
    system: 'A flight-tracking app. The input is a chat message.',
  });
}
```

</hb-code-example>

1. `chat` is the ref from `uiChatResource`. The resource needs only its `components` signal, `setComponents`, `sendMessage` and `isLoading` signal, described by the `UiDecisionChat` type.
2. `sendMessage(content)` asks the decision about `content`, sets the chat's components to the chosen ones, and then sends `content` to the chat. The send always uses the narrowed components.
3. Render the chat as usual, with `<hb-render-message>`. `<hb-ui-decision>` is only for candidates mode. The transcript, tools, `isLoading()` and `stop()` stay on the chat. The resource returns only `sendMessage`, `decision`, `isDeciding()` and `decisionError()`.
4. The decision sees each component's name and description. UI kits are decided over by member: each kit is expanded into its components, including the children they declare, and duplicate names count once.
5. A chosen component brings the components declared in its `children` with it, recursively, so the chat can always render a chosen parent's children. The chat sees the chosen components in the order they were declared.
6. Component names become option ids, so the flattened list must fit the selection limits: no name may be empty, contain `.`, or be `__proto__`, `constructor` or `prototype`, and `select: 'one'` allows at most 255 components.

### Two prompts

Chat mode uses two models, and each one has its own prompt. Neither prompt defaults to the other.

| Prompt                       | Read by            | What to write                             |
| ---------------------------- | ------------------ | ----------------------------------------- |
| `system` on the resource     | The decision model | What your app is and what the input means |
| `system` on `uiChatResource` | The chat model     | How to answer, with which tools and cards |

The resource's `system` is context for the decision. It is sent with each message, so describe the situation rather than give instructions. The chat never sees it, and the decision never sees the chat's system prompt or tools.

### Fallback

Decide when sure, offer everything otherwise. The message is sent with all of the chat's components when:

- confidence is below `minConfidence`;
- the decision fails, or `decision.stop()` aborts it;
- the components break the selection limits above (no decision is asked).

Failures are exposed as `decisionError()`. A `DecisionSchemaError` there means the components could not be decided over. `isDeciding()` is true while a decision is in flight.

### Restoring after the turn

When the narrowed turn finishes, errors or is stopped, the resource sets the chat's components back to the full list. A follow-up sent directly with `chat.sendMessage` sees every component, and earlier answers keep rendering, because a UI chat renders with every component it has offered.

### Concurrency

Calling `sendMessage` while a decision is still in flight aborts that decision and starts a new one, so only the latest message is sent. Once a message is sent, the chat owns it: sending while the chat is still generating behaves exactly like the chat's own `sendMessage`.

---

## Pinning the Questions on the Server

The browser builds the selection questions from your candidates or the chat's components. A public decision route answers whatever questions it is sent, unless the server pins them. To pin them, build the same schema on the server with `createSelectionSchema` from `@hashbrownai/core`, and pass it to the adapter's `schema` option. Pass the same `select` value the browser uses.

`createSelectionSchema` takes the same list the resource decides over, in the same order: your candidates, or the components you pass to `uiChatResource`. Each entry can be:

- a candidate item, `{ id, description }`, as in candidates mode;
- a component, such as an `exposeComponent` result or a component definition (`UiComponentDefinition`) with a `name`, a `description` and optional `children`;
- a UI kit.

UI kits and declared children are flattened exactly as the resource flattens them: each kit's members in place, each component followed by its declared children, and every name once. An entry with an `id` is always a candidate item, even if it also has a `name`; an entry with a `name` and no `id` is a component, and its option id is its `name`. So a chat component must not carry an `id` at the top level, or `createSelectionSchema` treats it as a candidate item and the pinned questions differ. Kit members and declared children are always components.

```ts
import { createSelectionSchema } from '@hashbrownai/core';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
// Shared with the browser: the components and kits passed to uiChatResource.
import { flightCard, cardsKit } from './cards';

const decision = await HashbrownTypeSafe.decide({
  apiKey: process.env.TYPESAFE_API_KEY!,
  model: 'jev-1.14.0',
  schema: createSelectionSchema([flightCard, cardsKit], { max: 2 }),
  request,
});
```

For candidates mode, pass the candidates (or just their `{ id, description }` items), such as `createSelectionSchema(cards, 'one')`. If the server can't import your components or kits, pass `{ name, description, children? }` definitions with the same names, descriptions and children, in the same order.

A pinned schema replaces the questions the browser sends, so `optionOrder: 'shuffled'` has no effect once the questions are pinned. The server always asks in the order it built.

---

## Writing Good Descriptions

- Describe when an option fits, not what it is. "The user asks about an airport" works better than "Airport card".
- Keep descriptions distinct. Overlapping options split confidence between them.
- In chat mode, child components are options too, and `select: 'one'` can pick a child alone. Say where a child belongs in its description, such as "A row, only inside a Table".
- Add an option for "none of these" when it makes sense. In candidates mode, simply render nothing when confidence is low.
- Pass short, plain input. See the model limits in [Decisions](/docs/angular/concept/decisions).

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/decisions">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Decisions</h4>
      <p>Ask typed closed questions with decisionResource.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="platform/typesafe">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Serve decisions with TypeSafe</h4>
      <p>Add the server route that answers decision requests.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
