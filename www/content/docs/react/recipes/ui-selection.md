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

Both modes take `select`: `'one'` chooses one option, and `{ max: 3 }` chooses up to three. Both take `minConfidence`.

The hook requires a `HashbrownProvider`. Set up the decision endpoint as described in [Decisions](/docs/react/concept/decisions).

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
import { exposeComponent, useUiDecision } from '@hashbrownai/react';

function Answer({ query }: { query: string }) {
  const { ui, isDeciding, decisionError } = useUiDecision({
    input: query === '' ? null : query,
    select: { max: 2 },
    minConfidence: 0.7,
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
    generate: { system: 'Show the cards that answer the question.' },
  });

  return <>{ui}</>;
}
```

</hb-code-example>

1. The decision sees each exposed component's name and description.
2. `generate` configures the UI completion that runs after it. `system` is required.
3. UI kits in `components` always go through to the completion. Only exposed components are decided over.
4. A list of only UI kits skips the decision and generates straight away.

### Low confidence

Decide when sure, generate everything otherwise. When confidence is below `minConfidence`, or the decision fails, narrowing generates with all of the components. A failure is exposed as `decisionError`.

`isDeciding` is true until the decision settles, `isGenerating` while the completion runs, and `isLoading` for either. The result also carries the UI completion's fields.

---

## Writing Good Descriptions

- Describe when an option fits, not what it is. "The user asks about an airport" works better than "Airport card".
- Keep descriptions distinct. Overlapping options split confidence between them.
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
