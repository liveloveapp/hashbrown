---
title: 'Decisions: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose among application-owned options with typed decisions and confidence metadata.'
---

# Decisions

<hb-docs-demo demo="canonical-workbench-decisions-angular">
</hb-docs-demo>

A decision answers a closed question using options your application defines. Instead of generating free-form text, the model returns a typed choice, boolean, or bounded score with metadata. That makes decisions useful for routing a request or suggesting the next step in a known workflow.

Keep exact calculations and deterministic rules in code. Use a decision when interpreting language or ambiguous context is the useful part. Give choices distinct meanings and include a clarification path when the available information is insufficient. Confidence is model metadata, not a calibrated probability or permission to execute an action.

<hb-concept-diagram concept="decisions"> </hb-concept-diagram>

## Route a reading request

Use the endpoint and client configuration from the [Quickstart](/docs/angular/start/quick). Keep `provideHashbrown` in `appConfig` and the `<app-root>` host. Import the standalone class below into `main.ts` and pass it to `bootstrapApplication()` with that same `appConfig`. Also configure the decision endpoint from the [TypeSafe guide](/docs/angular/platform/typesafe). Chat endpoint configuration alone does not provide decision transport.

This component stays idle until its button supplies input. The allowed answers separate discovery from reservation, with clarification for unclear requests. It displays a suggestion and performs no routed action.

```ts
import { Component, signal } from '@angular/core';
import { decisionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

const routeSchema = s.object('Route a book request', {
  route: s.enumeration('The next useful path', {
    discover: 'The reader wants recommendations or information about books.',
    reserve: 'The reader explicitly asks to reserve a known book.',
    clarify: 'The request does not establish either path.',
  }),
});

@Component({
  selector: 'app-root',
  template: `
    <button
      type="button"
      [disabled]="decision.isLoading()"
      (click)="input.set('Suggest a short classic for our club.')"
    >
      Choose a route
    </button>
    @if (decision.isLoading()) {
      <p role="status">Choosing…</p>
    }
    @if (decision.error()) {
      <p role="alert">Could not choose a route. Review manually.</p>
    }
    @if (decision.value(); as result) {
      <p>Suggested route: {{ result.route }}</p>
    }
  `,
})
export class ReadingDecision {
  readonly input = signal<string | null>(null);
  readonly decision = decisionResource({
    schema: routeSchema,
    input: this.input,
    system: 'Choose a route. Do not claim to make a reservation.',
  });
}
```

Input changes trigger decisions; editing a draft should not send requests unless that is the intended interaction. Read `meta` alongside `value` when your policy uses confidence or option probabilities. Evaluate any threshold with representative requests and offer manual review. A route suggestion does not reserve a book or authorize access to an account.

## Explore it in the workbench

<hb-workbench lesson="decisions">
</hb-workbench>

Our application already owns a two-step plan: outline the trusted UI demo, then record it. The outline is complete. What should we do next?

Let’s ask a closed question. The allowed answers are `record`, `review`, and `clarify`. The model returns a typed choice and confidence. It does not generate the plan, write component props, or stream text.

### Run the workbench

Start the [conversation workbench](/docs/angular/start/workbench) with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=decisions`. Keep the server environment and provider configuration from the [Quickstart](/docs/angular/start/quick). Selecting a lesson does not start a request.

Set `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` in the server environment as well. The recording pins `jev-1.14.0`; see [TypeSafe models](https://docs.typesafe.ai/models.md) for supported versions. Credentials stay on the server. Without those settings, the decision endpoint reports that it is unavailable; the generation lessons still work with OpenAI.

### Ask one useful question

The root is an `s.object`, and `nextAction` is an enumeration with descriptions for its allowed values:

<hb-code-example header="runtime/workbench.ts">

```ts
export const workbenchDecisionSchema = s.object(
  'Choose the next action for this plan',
  {
    nextAction: s.enumeration('The next useful action', {
      record: 'Record the demo after the outline is complete.',
      review: 'Review the demo after it has been recorded.',
      clarify: 'Ask for clarification when progress is unclear.',
    }),
  },
);
```

</hb-code-example>

`decisionResource()` receives the current prompt and application snapshot. Each explicit send gets a fresh request identifier and SDK runtime. Selecting the lesson or editing the prompt alone does not make a request.

<hb-expander title="Checked Angular decision setup">

<hb-code-example header="angular/src/app/decision-workbench.ts">

```ts
  private readonly resource = decisionResource({
    schema: workbenchDecisionSchema,
    system: workbenchDecisionSystem,
    input: computed(() => {
      const request = this.request();
      return {
        ...request,
        application: {
          revision: request.application.revision,
          nextAction: request.application.nextAction ?? null,
          plan: request.application.plan
            ? {
                title: request.application.plan.title,
                steps: [...request.application.plan.steps],
              }
            : null,
        },
      };
    }),
    debounce: 0,
    retries: 0,
    transport: (request, signal) =>
      createWorkbenchDecisionTransport(this.store(), this.request().requestId)(
        request,
        signal,
      ),
  });
```

</hb-code-example>

</hb-expander>

Read the [complete Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/decision-workbench.ts) for request lifetime, captured results, cancellation, and the application-owned result card.

### Follow the two requests

1. Send “The outline is complete. What should I do next?” The decision returns `record` with confidence.
2. Inspect **JSON** and its **Typed choice and confidence** section. This is one complete response, not a stream of generated text.
3. Select **State**, then **Use suggestion**. The explicit action saves `nextAction: record` and advances the revision to `1`.
4. Send “The demo is recorded. What should I do next?” The new input includes the current application snapshot, and the decision returns `review`.

Decisions evaluate the input snapshot supplied for each request. They do not automatically load a chat history. The workbench keeps both requests in one feed so we can inspect what changed.

<img src="/video/docs/canonical-workbench-decisions-angular-result.png" alt="The app-owned plan appears beside the complete decision response and the SDK's typed choice and confidence." width="1600" height="1000" loading="lazy" />

### Treat confidence as application policy

The workbench enables **Use suggestion** at confidence `0.75` or higher, after a fresh successful response. That threshold is our policy. Confidence is model metadata, not a calibrated probability that the choice is correct. Evaluate the policy against representative inputs from your own feature.

Below the threshold, the interface asks us to review the plan manually. Errors and cancellation also preserve application state and offer retry or manual review. A response from an older request cannot authorize a new turn, and an already used suggestion cannot be applied again.

Use the timeline to inspect **Decision** and **Suggestion applied** separately. Replay shows captured choices, confidence, and state. It cannot make another decision or apply a suggestion.

### Choose a decision or generation

| Need                                       | API                                                           |
| ------------------------------------------ | ------------------------------------------------------------- |
| Pick one of known next actions             | Decision.                                                     |
| Return free-form plan text and steps       | [Structured output](/docs/angular/concept/structured-output). |
| Select trusted components and supply props | [Generative UI](/docs/angular/concept/components).            |

A decision can choose a route without performing the routed action. Keep writes and authorization in application or server code.

### Decidable schemas and metadata

The root must be `s.object`. Enumerations become choice questions, booleans become yes/no questions, and bounded numeric scales become score questions. Nested objects flatten into dotted question IDs; property names cannot contain `.`. Strings, arrays, and `anyOf` are not decision questions.

Choice metadata includes `confidence` and `probabilities` per option. Boolean metadata includes `probability`. Score metadata includes the most likely level, a probability-weighted `score`, and probabilities per level. The SDK mirrors metadata to the shape of the typed value.

Keep inputs short and relevant. Compute counts and other exact facts in code. Give options distinct descriptions and include a clarification or other path when the input does not establish a useful choice. Test option ordering against real inputs; `optionOrder: 'shuffled'` is available for policies that allow it. The workbench server deliberately pins its question options and order.

### Keep the questions on the server

The local endpoint fixes the plan, question schema, and system policy before calling `HashbrownTypeSafe.decide`. It bounds input, forwards cancellation, and keeps credentials server-side. Browser-supplied questions cannot replace the allowed options.

The [TypeSafe provider guide](/docs/angular/platform/typesafe) explains endpoint configuration and adapter errors. To decide inside an agent node or tool, continue with [Decisions in Agents](/docs/angular/recipes/decisions-in-agents). For component selection, use [UI selection](/docs/angular/recipes/ui-selection). The [`decisionResource()` API](/api/angular/decisionResource) describes debounce, retries, stop, reload, and transport options.
