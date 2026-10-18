---
title: 'Decisions: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Ask a decision model closed questions about your app state and get typed answers with confidence.'
---

# Decisions

<p class="subtitle">Ask a decision model closed questions about your app state and get typed answers with confidence.</p>

- A decision picks from options you define: an enumeration, a yes or no, or a number on a short scale.
- The answer is typed from a Skillet schema and comes with the model's confidence.
- Decisions do not stream and do not write text. They are fast and cheap, which makes them good at routing.
- Decisions run on a server route that holds your API key. The first adapter is [TypeSafe](/docs/angular/platform/typesafe).

---

## Decide or Generate

Use a decision when the answer is one of a known set of options. Use generation when the answer is open ended.

| Task                                    | Use        |
| --------------------------------------- | ---------- |
| Route a question to the right panel     | Decision   |
| Pick which card to show for a query     | Decision   |
| Classify, triage or tag input           | Decision   |
| Write an answer, summary or explanation | Generation |
| Fill in the props of a component        | Generation |

A good pattern combines them: decide first, and generate only when the decision is not sure.

---

## The `decisionResource()` Function

The @hashbrownai/angular!decisionResource:function resource asks the questions in a schema about an input and returns a typed value.

<hb-code-example header="route a question">

```ts
import { Component, computed, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { decisionResource } from '@hashbrownai/angular';

const routeSchema = s.object('Where to send the question', {
  intent: s.enumeration('What the user wants to do', {
    filter: 'Narrow the list of flights on the map',
    chat: 'Ask a question that needs a written answer',
    other: 'Anything else',
  }),
  clear: s.boolean('The user wants to clear the current filter'),
});

@Component({
  selector: 'app-search',
  template: `
    @if (route.value()?.intent === 'filter') {
      <app-filter-panel />
    } @else {
      <app-chat />
    }
  `,
})
export class SearchComponent {
  readonly query = input('');

  readonly route = decisionResource({
    schema: routeSchema,
    input: computed(() => (this.query() === '' ? null : this.query())),
    system: 'You route questions in a flight-tracking app.',
    debounce: 150,
  });
}
```

</hb-code-example>

1. The schema describes the questions. Each property is one question.
2. The `input` is the state to decide about. A `null` value keeps the resource idle.
3. `system` is prepended to the state the model sees.
4. `debounce` waits for the input to settle before sending a request.

The resource requires `provideHashbrown`. Changing `system` aborts the request and resets `value` and `meta` to `null` before the new decision arrives.

<hb-code-example header="configure the decision endpoint">

```ts
import { provideHashbrown } from '@hashbrownai/angular';

export const appConfig: ApplicationConfig = {
  providers: [provideHashbrown({ decision: { url: '/api/decide' } })],
};
```

</hb-code-example>

The endpoint defaults to `/api/decide`. The provider `middleware` applies to decision requests, and `decision.transport` replaces the HTTP transport entirely. Every resource also accepts its own `transport`.

---

## Decidable Schemas

The root of the schema must be `s.object`. Each property can be:

| Skillet type                             | Question type | Notes                                             |
| ---------------------------------------- | ------------- | ------------------------------------------------- |
| `s.enumeration`                          | Choice        | Up to 255 options                                 |
| `s.boolean`                              | Yes or no     | Meta holds a `probability`                        |
| `s.integer` with `minimum` and `maximum` | Score         | Inclusive bounds, 2 to 10 levels                  |
| `s.number` with bounds and `multipleOf`  | Score         | Inclusive bounds, 2 to 10 levels                  |
| `s.object`                               | Nested        | Properties are flattened into dotted question ids |

Property names cannot contain `.`. Anything else, such as strings, arrays or `anyOf`, is a TypeScript error. Number bounds are checked when the resource is created.

```ts
const triage = s.object('Triage', {
  urgency: s.integer('How urgent is this', { minimum: 1, maximum: 5 }),
  weight: s.number('How much it matters', {
    minimum: 0,
    maximum: 1,
    multipleOf: 0.25,
  }),
  customer: s.object('Customer', {
    tier: s.enumeration('Account tier', ['free', 'pro', 'enterprise']),
  }),
});
```

### Describing options

Pass a record to `s.enumeration` to describe each option. Decision models use the descriptions to tell the options apart.

```ts
s.enumeration('Kind of aircraft', {
  jet: 'Jets and airliners',
  rotor: 'Helicopters',
  other: 'Anything else',
});
```

In ordinary structured output the same schema emits a plain `enum`, and the descriptions are appended to the description text as a list. The record form is safe to use anywhere.

---

## Reading the Result

```ts
const route = decisionResource({ schema: routeSchema, input: query });

route.value(); // { intent: 'filter' | 'chat' | 'other'; clear: boolean } | null
route.meta(); // { intent: { confidence, probabilities }, clear: { probability } } | null
route.isLoading();
route.error();
route.reload();
route.stop();
```

`meta` mirrors the shape of `value`. An enumeration has `confidence` and `probabilities` per option. A number has a probability-weighted `score` as well. A boolean has a `probability`.

---

## Confidence Routing

A decision is most useful when you act on it only if it is sure. Compare `confidence` to a threshold you choose, and fall back to generation or to a default when it is lower.

```ts
const MIN_CONFIDENCE = 0.7;

readonly route = decisionResource({ schema: routeSchema, input: this.query });

readonly mode = computed(() => {
  const value = this.route.value();
  const meta = this.route.meta();

  if (value && meta && meta.intent.confidence >= MIN_CONFIDENCE) {
    // Sure enough to act on the decision.
    return value.intent === 'filter' ? 'filter' : 'chat';
  }

  // Unsure, or still deciding: let the model generate instead.
  return 'chat';
});
```

Start with a threshold around 0.7 and tune it against real inputs. A higher threshold generates more, and a lower one decides more.

---

## Working with Model Limits

Decision models are strong at classification and weak at some things. Plan around the limits.

- **Bucket numbers in code.** Models are poor at counting and arithmetic. Do not ask "how many flights are on the map". Compute the number, turn it into a bucket such as `'none'`, `'few'` or `'many'` in code, and pass the bucket.
- **Never pass hex codes or dates.** Opaque encodings such as `a1b2c3` and raw timestamps are unreliable. Pass a plain label (`'a Boeing 737'`) or a derived fact (`'departed 2 hours ago'`).
- **Keep the input short.** Long, irrelevant context hurts accuracy. Pass only what the question needs.
- **Avoid double negatives.** Write "The user wants to clear the filter", not "The user does not want to keep the filter".
- **Options are biased toward the first one listed.** Use `optionOrder: 'shuffled'` to vary the order on every request and spread the bias.
- **Include an `other` option.** Without a way out, the model has to pick a wrong option. An `other` option gives uncertain inputs somewhere to go, and you can route it to generation.

```ts
const route = decisionResource({
  schema: routeSchema,
  input: query,
  optionOrder: 'shuffled',
});
```

---

## Pinning Questions on the Server

By default the client sends the questions. To stop clients from asking anything they like, pass the same `schema` to `HashbrownTypeSafe.decide` on the server. The server compiles its own questions and ignores the ones in the request. See [TypeSafe](/docs/angular/platform/typesafe).

---

## Errors

Failures appear in `error`: a transport error, a response that does not match the schema, or a schema the model cannot answer. A decision never returns a partial value. Retryable transport errors are retried up to `retries` times.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="recipes/ui-selection">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Choose UI with a decision</h4>
      <p>Pick components for an input with uiDecisionResource.</p>
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
