---
title: 'UI Selection: Hashbrown React Docs'
meta:
  - name: description
    content: 'Choose which React components to show for an input, or narrow a chat, with a decision.'
---

# UI Selection

<p class="subtitle">Choose which React components to show for an input, or narrow a chat, with a decision.</p>

1. Describe each option in plain language.
2. The @hashbrownai/react!useUiDecision:function hook asks a decision model which option fits the input.
3. Render only the options it chooses, or let a chat answer with only the components it chooses.

---

## Two Modes

useUiDecision has two modes. Which one you get depends on the options you pass.

| Mode       | You pass                 | The model chooses                              | Who fills in props |
| ---------- | ------------------------ | ---------------------------------------------- | ------------------ |
| Candidates | `input` and `candidates` | Among elements your code has already built     | Your code          |
| Chat       | `chat`, from `useUiChat` | Which of the chat's components fit the message | The chat, as usual |

Both modes take these options:

| Option          | Required | What it does                                                                                                |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `select`        | Yes      | `'one'` chooses one option, and `{ max: 3 }` chooses up to three.                                           |
| `minConfidence` | No       | The confidence needed to act on the choice. Defaults to 0.                                                  |
| `system`        | No       | Context for the decision model: what your app is and what the input means.                                  |
| `optionOrder`   | No       | `'shuffled'` varies the order of the options on every request, to spread the model's bias toward the first. |
| `transport`     | No       | Overrides the provider's decision transport. In chat mode, the chat keeps its own transport.                |

The hook requires a `HashbrownProvider`. Set up the decision endpoint as described in [Decisions](/docs/react/concept/decisions).

---

## Candidates Mode

Use candidates when your code already knows what each option shows. The model never writes props. It only picks.

Candidates mode also takes these options:

| Option         | Required | What it does                                                                 |
| -------------- | -------- | ---------------------------------------------------------------------------- |
| `input`        | Yes      | The input to decide about. `null` or `undefined` keeps the hook idle.        |
| `candidates`   | Yes      | The elements the model chooses from.                                         |
| `debounceTime` | No       | Waits for the input to settle before deciding. Changing `system` asks again. |

<hb-code-example header="choose among candidates">

```tsx
import { useUiDecision } from '@hashbrownai/react';

function Answer({ query }: { query: string }) {
  const { ui } = useUiDecision({
    input: query === '' ? null : query,
    select: 'one',
    minConfidence: 0.7,
    candidates: [
      {
        id: 'flight',
        description: 'The user asks about one aircraft',
        element: <FlightCard />,
      },
      {
        id: 'airport',
        description: 'The user asks about an airport',
        element: <AirportCard />,
      },
    ],
  });

  return <>{ui}</>;
}
```

</hb-code-example>

1. Each candidate has a unique `id` that is not empty and has no `.`, a `description` that tells the model when it fits, and an `element`.
2. `ui` holds the chosen elements in order. `ids` holds their ids.
3. Candidates mode renders nothing while the decision is pending, when there are no candidates, and when confidence is below `minConfidence`.

With `select: 'one'`, confidence is the model's confidence in its pick. With `{ max }`, each candidate is a yes or no question. Candidates at 0.5 probability or higher are kept, sorted by probability, and capped at `max`. `minConfidence` is compared to the best probability.

---

## Narrowing a Chat

Use chat mode when a chat writes the answer and you want each answer to use only the components that fit the message. The app keeps its own chat, with its own system prompt and tools, and sends messages through the hook instead. A decision first picks from the chat's components. Then the chat answers, seeing only the chosen components. This keeps the prompt small and the choices focused.

<hb-code-example header="narrow a chat">

```tsx
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  useTool,
  useUiChat,
  useUiDecision,
} from '@hashbrownai/react';

function Assistant() {
  const getFlights = useTool({
    name: 'getFlights',
    description: 'Get the flights near an airport',
    schema: s.object('Airport', { ident: s.string('The airport identifier') }),
    handler: async ({ ident }) => fetchFlights(ident),
    deps: [],
  });

  // 1. The app's own chat: its system prompt, components and tools.
  const chat = useUiChat({
    system:
      'Answer questions about live flights. Use the cards to show results.',
    tools: [getFlights],
    components: [
      exposeComponent(FlightCard, {
        name: 'FlightCard',
        description: 'Shows one aircraft',
        props: { callsign: s.string('The aircraft callsign') },
      }),
      exposeComponent(AirportCard, {
        name: 'AirportCard',
        description: 'Shows an airport',
        props: { ident: s.string('The airport identifier') },
      }),
    ],
  });

  // 2. Narrows the chat's components for each message.
  const { sendMessage, isDeciding, decisionError } = useUiDecision({
    chat,
    select: { max: 2 },
    minConfidence: 0.7,
    system: 'A flight-tracking app. The input is a chat message.',
  });

  // 3. Send through the hook, and render the chat as usual.
  return (
    <>
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <div key={index}>{message.ui}</div>
        ) : (
          <p key={index}>{String(message.content)}</p>
        ),
      )}
      <Composer disabled={isDeciding} onSend={sendMessage} />
    </>
  );
}
```

</hb-code-example>

1. `chat` is the result of `useUiChat`. The hook needs only its `components`, `setComponents`, `sendMessage` and `isLoading`, described by the `UiDecisionChat` type.
2. `sendMessage(content)` asks the decision about `content`, sets the chat's components to the chosen ones, and then sends `content` to the chat. The send always uses the narrowed components.
3. The transcript, `ui`, tools, `isLoading` and `stop` stay on the chat. The hook returns only `sendMessage`, `decision`, `isDeciding` and `decisionError`.
4. The decision sees each component's name and description. UI kits are decided over by member: each kit is expanded into its components, including the children they declare, and duplicate names count once.
5. A chosen component brings the components declared in its `children` with it, recursively, so the chat can always render a chosen parent's children. The chat sees the chosen components in the order they were declared.
6. Component names become option ids, so the flattened list must fit the selection limits: no name may be empty, contain `.`, or be `__proto__`, `constructor` or `prototype`, and `select: 'one'` allows at most 255 components.

### Two prompts

Chat mode uses two models, and each one has its own prompt. Neither prompt defaults to the other.

| Prompt                  | Read by            | What to write                             |
| ----------------------- | ------------------ | ----------------------------------------- |
| `system` on the hook    | The decision model | What your app is and what the input means |
| `system` on `useUiChat` | The chat model     | How to answer, with which tools and cards |

The hook's `system` is context for the decision. It is sent with each message, so describe the situation rather than give instructions. The chat never sees it, and the decision never sees the chat's system prompt or tools.

### Fallback

Decide when sure, offer everything otherwise. The message is sent with all of the chat's components when:

- confidence is below `minConfidence`;
- the decision fails, or `decision.stop()` aborts it (stopping never cancels the send);
- the components break the selection limits above (no decision is asked).

Failures are exposed as `decisionError`. A `DecisionSchemaError` there means the components could not be decided over. `isDeciding` is true while a decision is in flight.

### Restoring after the turn

When the narrowed turn finishes, errors or is stopped, the hook sets the chat's components back to the full list. The same happens when the chat never starts the turn, and when the hook unmounts while the chat is narrowed. A follow-up sent directly with `chat.sendMessage` sees every component. If your app replaces the chat's components during the turn, the hook leaves your list in place.

A UI chat keeps every component it has ever offered, one per name, and the newest definition of a name replaces older ones. Earlier answers render with that set, so they keep rendering after a narrowed turn or a `setComponents` call. New responses are parsed against it too, so a provider that does not enforce the response schema strictly can still render a component that is no longer offered.

### Errors

`sendMessage` throws at once, as the chat's own `sendMessage` would, when the chat cannot take a message, for example while an interrupt batch is pending. If the chat refuses the message after the decision, the hook restores every component and exposes the error as `decisionError`.

### Concurrency

Calling `sendMessage` while a decision is still in flight aborts that decision and starts a new one, so only the latest message is sent. Once a message is sent, the chat owns it: sending while the chat is still generating behaves exactly like the chat's own `sendMessage`.

---

## Pinning the Questions on the Server

The browser builds the selection questions from your candidates or the chat's components. A public decision route answers whatever questions it is sent, unless the server pins them. To pin them, build the same schema on the server with `createSelectionSchema` from `@hashbrownai/core`, and pass it to the adapter's `schema` option. Pass the same `select` value the browser uses.

`createSelectionSchema` takes the same list the hook decides over, in the same order: your candidates, or the components you pass to `useUiChat`. Each entry can be:

- a candidate item, `{ id, description }`, as in candidates mode;
- a component, such as an `exposeComponent` result or a component definition (`UiComponentDefinition`) with a `name`, a `description` and optional `children`;
- a UI kit.

UI kits and declared children are flattened exactly as the hook flattens them: each kit's members in place, each component followed by its declared children, and every name once. An entry with an `id` is always a candidate item, even if it also has a `name`; an entry with a `name` and no `id` is a component, and its option id is its `name`. So a chat component must not carry an `id` at the top level, or `createSelectionSchema` treats it as a candidate item and the pinned questions differ. Kit members and declared children are always components.

```ts
import { createSelectionSchema } from '@hashbrownai/core';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
// Shared with the browser: the components and kits passed to useUiChat.
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
- Pass short, plain input. See the model limits in [Decisions](/docs/react/concept/decisions).

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/decisions">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Decisions</h4>
      <p>Ask typed closed questions with useDecision.</p>
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
