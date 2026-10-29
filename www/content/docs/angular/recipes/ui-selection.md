---
title: 'UI Selection: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Choose between trusted plan views with UI decision candidates, inspect confidence, and keep application data and manual control in the app.'
---

# UI Selection

<hb-workbench lesson="ui-selection">
</hb-workbench>

I sometimes want the model to choose a view without generating its content. Let's show the same two-step plan as a summary, then as ordered steps. The application owns both components and every prop. The model chooses only an ID.

`uiDecisionResource` runs in candidates mode with `select: 'one'`. The real SDK renders the selected candidate. A separate **Use view** action commits it to application state.

## Run the workbench

Start the [conversation workbench](/docs/angular/start/workbench) with server-only `TYPESAFE_API_KEY` and an exact `TYPESAFE_MODEL` available to your account. The current checked recording uses `jev-1.14.0`. The shared host also needs `OPENAI_API_KEY` and `OPENAI_MODEL` for its other lessons.

```sh
npx nx workbench-serve www
```

Open `http://127.0.0.1:4370/angular.html?lesson=ui-selection`. This lesson uses the decision endpoint `/api/workbench/ui-selection`. A decision arrives whole; it is not a JSON text stream.

## Follow the selected view

1. Send **First prompt** to ask for an overview. Inspect the known candidate ID and confidence beside the app-owned summary.
2. Choose **Use view** after a fresh, successful, confident decision. If confidence is below the threshold, choose **Show summary** manually instead. Either explicit action saves the summary view and advances the revision to 1.
3. Send **Follow-up** to ask for ordered steps. A confident result can preview that candidate; a low-confidence result remains inspectable and offers manual choice. Neither result applies the view automatically.
4. Choose **Show steps** manually. This explicit action saves the steps view and advances the revision to 2. It does not rewrite the plan's title or steps.
5. Use the bottom timeline to compare the complete decisions, manual choice, and application state. Replay renders the same trusted views with no active handlers, requests, or writes.

<img src="/video/docs/canonical-workbench-ui-selection-angular-result.png" alt="The Angular workbench shows the application-owned ordered plan view beside its candidate components and the SDK's selection and confidence." width="1600" height="1000" loading="lazy" />

## Register known candidates

Both clients and the server share these IDs, descriptions, and order:

<hb-code-example header="runtime/workbench-recipes.ts">

```ts
export const workbenchSelectionOptions = [
  {
    id: 'summary',
    description:
      'Show the plan title and a brief overview of the two-step plan.',
  },
  {
    id: 'steps',
    description: 'Show the plan as an ordered list of its two steps.',
  },
] as const;
```

</hb-code-example>

The framework binds each candidate to a component with the fixed plan as its props. The server pins the matching selection schema. Browser-supplied questions cannot replace those candidates or turn selection into generated props.

<hb-code-example header="runtime/workbench-recipes.ts">

```ts
export const workbenchSelectionSchema = createSelectionSchema(
  workbenchSelectionOptions,
  'one',
);
```

</hb-code-example>

This is different from [Generative UI](/docs/angular/concept/components), where the model supplies schema-constrained props for exposed components. Here it chooses between elements the application already constructed.

## Use the framework API

The checked client connects the lesson to the real SDK:

<hb-code-example header="angular/src/app/selection-workbench.ts">

```ts
protected readonly resource = uiDecisionResource({
    input: computed(() => this.request()),
    system: workbenchSelectionSystem,
    candidates,
    select: 'one',
    minConfidence: workbenchSelectionMinConfidence,
    optionOrder: 'declared',
    debounce: 0,
    transport: (request, signal) =>
      createWorkbenchDecisionTransport(
        this.store(),
        this.request().requestId,
        undefined,
        getWorkbenchLesson(window.location.search).endpoint,
      )(request, signal),
  });
```

</hb-code-example>

## Keep confidence and manual control explicit

The threshold is 0.75. Treat confidence as a model score, not a calibrated probability of correctness. A complete response below the threshold remains inspectable, but it does not enable **Use view**. The `{ }` toggle on the captured side shows the provider's choice; **SDK selection and confidence** shows the SDK's confidence-filtered IDs. A choice can be present in the raw frame while no candidate renders.

Use the manual **Show summary** and **Show steps** controls when you want to choose directly. Manual selection works without waiting for the model. It cancels pending selection work and prevents a late result from replacing your choice. It is an explicit application action, not a model response.

Failed, invalid, cancelled, or stale decisions preserve the current view and offer manual choice or an explicit retry. A decision for an older application revision cannot be applied to the new one. Refreshing clears the in-memory conversation and view state.

## Keep the server boundary

The canonical server is a local development host. Add authentication, authorization, and request controls before exposing a credential-backed endpoint. Candidate validation does not prove that a user can access the data shown by a component.

Both the normal server and live verifier choose the server-owned TypeSafe schema for this lesson. The decision protocol stays separate from AG-UI chat routes. Keep credentials on the server and connect disconnects to cancellation.

Read the [framework client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/selection-workbench.ts) and [shared candidate contract](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-recipes.ts). See [TypeSafe](/docs/angular/platform/typesafe) for setup and [Decisions](/docs/angular/concept/decisions) for complete typed choices.
