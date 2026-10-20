---
title: 'UI Selection: Hashbrown React Docs'
meta:
  - name: description
    content: 'Choose which React components to show for an input with a decision.'
---

# UI Selection

<p class="subtitle">Choose which React components to show for an input with a decision.</p>

1. Describe each option in plain language.
2. The @hashbrownai/react!useUiDecision:function hook asks a decision model which option fits the input.
3. Render only the options it chooses.
4. Optionally let the model fill in the props of the chosen components.

---

## Two Modes

useUiDecision has two modes. Which one you get depends on the options you pass.

| Mode       | You pass                  | The model chooses                          | Who fills in props      |
| ---------- | ------------------------- | ------------------------------------------ | ----------------------- |
| Candidates | `candidates`              | Among elements your code has already built | Your code               |
| Narrowing  | `components` + `generate` | Which exposed components to use            | The model, by streaming |

Both modes take these options:

| Option            | Required          | What it does                                                                                                                                                                   |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`           | Yes               | The input to decide about. `null` or `undefined` keeps the hook idle.                                                                                                          |
| `select`          | Yes               | `'one'` chooses one option, and `{ max: 3 }` chooses up to three.                                                                                                              |
| `minConfidence`   | No                | The confidence needed to act on the choice. Defaults to 0.                                                                                                                     |
| `system`          | No                | Context for the decision model: what your app is and what the input means. Changing it asks again.                                                                             |
| `optionOrder`     | No                | `'shuffled'` varies the order of the options on every request, to spread the model's bias toward the first.                                                                    |
| `debounceTime`    | No                | Waits for the input to settle before deciding. In narrowing mode, generation starts as soon as the decision settles; when no decision runs, this debounces generation instead. |
| `transport`       | No                | Decision only: overrides the provider's decision transport. Generation uses the provider's chat transport.                                                                     |
| `generate.system` | In narrowing mode | The system prompt for the model that writes the chosen components' props.                                                                                                      |

The hook requires a `HashbrownProvider`. Set up the decision endpoint as described in [Decisions](/docs/react/concept/decisions).

---

## Two Prompts

UI selection can call two models, and each one has its own prompt. Neither prompt defaults to the other.

| Option            | Read by                                     | What to write                               |
| ----------------- | ------------------------------------------- | ------------------------------------------- |
| `system`          | The decision model, in both modes           | What your app is and what the input means   |
| `generate.system` | The model that writes props, narrowing only | How to fill in the chosen components' props |

`system` is context for the decision model. It is sent with the input, so describe the situation rather than give instructions. `generate.system` is the system prompt for the UI completion that runs after the decision in narrowing mode. It is required there, and the decision never sees it.

```ts
const answer = useUiDecision({
  input: query,
  select: { max: 2 },
  // Context for the decision model.
  system:
    'A flight-tracking app. The input is a search query about aircraft or airports.',
  components: [flightCard, airportCard],
  // The system prompt for the model that writes the chosen components' props.
  generate: {
    system: 'Fill in the chosen cards from the query. Use short labels.',
  },
});
```

---

## Candidates Mode

Use candidates when your code already knows what each option shows. The model never writes props. It only picks.

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

## Narrowing Mode

Use narrowing when the model should write props. A decision first picks from the components you expose. Then a UI completion streams props, seeing only the chosen components. This keeps the prompt small and the choices focused.

<hb-code-example header="narrow, then generate">

```tsx
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiDecision } from '@hashbrownai/react';

function Answer({ query }: { query: string }) {
  const { ui, isDeciding, decisionError } = useUiDecision({
    input: query === '' ? null : query,
    select: { max: 2 },
    minConfidence: 0.7,
    system: 'A flight-tracking app. The input is a search query.',
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
    generate: { system: 'Fill in the chosen cards from the query.' },
  });

  return <>{ui}</>;
}
```

</hb-code-example>

1. The decision sees each component's name and description.
2. UI kits in `components` are decided over by member. Each kit is expanded into its components, including the children they declare, and duplicate names count once. A list of only UI kits decides over the kits' members.
3. A chosen component brings the components declared in its `children` with it, recursively, so the completion can always render a chosen parent's children. The completion sees the chosen components in the order they were declared.
4. `generate.system` is the system prompt for the UI completion that runs after the decision. It is required. The completion uses the provider's chat transport; to send it to a different endpoint, nest another `HashbrownProvider` around the component. It starts as soon as the decision settles, because the input was already debounced before the decision. When no decision runs (an empty `components` list, or one that breaks the limits below), it debounces the input with `debounceTime` instead.
5. An empty `components` list skips the decision and generates straight away.
6. Component names become option ids, so the flattened list must fit the selection limits: no name may be empty, contain `.`, or be `__proto__`, `constructor` or `prototype`, and `select: 'one'` allows at most 255 components. When the list breaks a limit, narrowing skips the decision, generates with every component, and exposes the `DecisionSchemaError` as `decisionError`.

### Low confidence

Decide when sure, generate everything otherwise. When confidence is below `minConfidence`, or the decision fails, narrowing generates with the `components` you passed, unchanged, with UI kits intact. A failure is exposed as `decisionError`.

`isDeciding` is true until the decision settles, `isGenerating` while the completion runs, and `isLoading` for either. The result also carries the UI completion's fields.

---

## Pinning the Questions on the Server

The browser builds the selection questions from your candidates or components. A public decision route answers whatever questions it is sent, unless the server pins them. To pin them, build the same schema on the server with `createSelectionSchema` from `@hashbrownai/core`, and pass it to the adapter's `schema` option. Pass the same `select` value the browser uses.

`createSelectionSchema` takes the same list you pass to the hook, in the same order. Each entry can be:

- a candidate item, `{ id, description }`, as in candidates mode;
- a component, such as an `exposeComponent` result or a component definition (`UiComponentDefinition`) with a `name`, a `description` and optional `children`;
- a UI kit.

UI kits and declared children are flattened exactly as the hook flattens them: each kit's members in place, each component followed by its declared children, and every name once. An entry with an `id` is always a candidate item, even if it also has a `name`; an entry with a `name` and no `id` is a component, and its option id is its `name`. So a component you pass to the hook must not carry an `id` at the top level, or `createSelectionSchema` treats it as a candidate item and the pinned questions differ. Kit members and declared children are always components.

```ts
import { createSelectionSchema } from '@hashbrownai/core';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
// Shared with the browser: the components and kits passed to `components`.
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
- In narrowing mode, child components are options too, and `select: 'one'` can pick a child alone. Say where a child belongs in its description, such as "A row, only inside a Table".
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
