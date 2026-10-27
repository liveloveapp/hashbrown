---
title: 'Structured output: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Stream a typed two-step plan, review it, and accept it explicitly.'
---

# Structured output

<hb-docs-demo demo="canonical-workbench-structured-angular">
</hb-docs-demo>

Let’s use the same two-step plan, this time as typed data. The model returns a title and two steps. Hashbrown parses the response as it streams, and our application renders those values.

I like keeping the example familiar. In [Generative UI](/docs/angular/concept/components), the model selects `SummaryCard` from a catalog. Here, `structuredChatResource()` returns plan data and the application chooses how to display it.

## Run the same conversation

Use the [conversation workbench](/docs/angular/start/workbench) with the server environment from the [Quickstart](/docs/angular/start/quick). Start it with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=structured-output`. Selecting a lesson does not send a request.

The recording uses this checked Angular client with real provider requests. The local server keeps credentials, instructions, tools, and response schema on the server. Refresh clears the in-memory conversations and accepted plan.

## Describe the plan

The shared schema describes a title and a streaming array of step strings. Both frameworks and the server use this same contract.

<hb-code-example header="runtime/workbench.ts">

```ts
export const workbenchPlanSchema = s.object('A two-step plan proposal', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two concise steps',
    s.string('A clear action'),
  ),
});
```

</hb-code-example>

`s.streaming.array` lets resolved steps appear before the whole response finishes. It does not mean the plan is ready to accept. The workbench also checks application rules: a nonempty title of at most 120 characters and exactly two nonempty steps, each at most 200 characters.

## Request typed data

The checked Angular client uses `structuredChatResource()` with the plan schema, the same read-only `readContext` tool, and the capturing transport:

<hb-code-example header="angular/src/app/structured-workbench.ts">

```ts
  readonly chat = structuredChatResource({
    system: workbenchStructuredSystem,
    schema: getWorkbenchPlanSchema(
      getWorkbenchLesson(window.location.search).id,
    ),
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
    tools: [
      createTool({
        name: 'readContext',
        description:
          'Read the accepted application plan and revision without changing state.',
        handler: async () => {
          const result = this.store.getSnapshot().application;
          this.store.record('tool', { name: 'readContext', result });
          return result;
        },
      }),
    ],
  });
```

</hb-code-example>

The latest assistant message exposes its parsed plan in `content`. The application renders that data into its plan card. There is no generated component tree in this lesson.

[Read the checked Angular implementation](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/structured-workbench.ts). It includes the rendered card, captured origins, cancellation, and explicit acceptance.

## Watch the preview become a result

Send the first prompt. Keep **JSON** selected to see response text arrive beside the plan. The **Typed plan** section beside it shows values resolved by the SDK. Select **State** before accepting: the application still has revision `0` and no accepted plan.

<img src="/video/docs/canonical-workbench-structured-angular-result.png" alt="The model streams a plain title and steps while the application renders a plan preview beside the typed data." width="1600" height="1000" loading="lazy" />

## Accept a completed plan

Select **Accept plan** after the successful response completes. The handler rechecks the plan at the action boundary, copies only validated fields, and advances the application revision. Then send “Make the second step shorter.” The tool reads the accepted plan and the response proposes a revision.

A partial response is a preview. A failed, cancelled, truncated, stale, or already accepted result cannot be applied. A failed follow-up keeps the accepted plan. Selecting a historical timeline moment cannot change live application state.

This example stores the accepted plan in browser memory. Enforce authorization and validation separately for any server write.

## Keep the response schema intact

Hashbrown sends the schema in `RunAgentInput.forwardedProps.hashbrown.responseSchema`. The [provider adapter](/docs/angular/start/platforms) uses that schema, while the client parses streamed text into typed content. Hashbrown does not add an `output` tool to request structured output.

The local workbench endpoint pins its own schema for each lesson. If you customize your endpoint, preserve the schema your feature needs. The [secured text-only endpoint](/docs/angular/recipes/public-endpoint) deliberately removes browser-supplied schemas as part of its different policy.

## Next steps

Use [Streaming](/docs/angular/concept/streaming) to explore the streaming markers, then [Natural language forms](/docs/angular/recipes/natural-language-to-structured-data) to connect typed data to a form. See [Skillet schemas](/docs/angular/concept/schema) for supported schema inputs and constraints, or [Tools](/docs/angular/concept/functions) to follow the plan’s context read.
