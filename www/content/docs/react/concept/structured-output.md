---
title: 'Structured output: Hashbrown React Docs'
meta:
  - name: description
    content: 'Turn model responses into typed application data for display and review.'
---

# Structured output

<hb-docs-demo demo="canonical-workbench-structured-react">
</hb-docs-demo>

Structured output gives an application typed data instead of prose it must interpret. A response schema describes the fields you need. Hashbrown parses the arriving response into that shape, and your application decides how to display or use it.

Use it for extracting form values, classifying a request with explanations, or producing a proposal for review. Choose [generative UI](/docs/react/concept/components) when the model should also choose components. A valid shape is one part of accepting a result: completion, business rules, and permission to perform a write still belong to the application.

<hb-concept-diagram concept="structured-output"> </hb-concept-diagram>

## Extract a book request

Use the endpoint and client configuration from the [Quickstart](/docs/react/start/quick). Render the component below inside the existing `HashbrownProvider`. The endpoint must preserve the client response schema and use a provider that supports it.

```tsx
import { useStructuredChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const readingSchema = s.object('A request for a book', {
  title: s.string('The requested book title'),
  author: s.string('The author named by the user'),
  copies: s.integer('How many copies are requested', {
    minimum: 1,
    maximum: 20,
  }),
});

export function ReadingRequest() {
  const chat = useStructuredChat({
    system:
      'Extract the title, author, and requested copy count from the user message.',
    schema: readingSchema,
  });
  return (
    <main>
      <button
        type="button"
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: 'I need two copies of Pride and Prejudice by Jane Austen.',
          })
        }
      >
        Generate
      </button>
      {chat.isLoading && <p role="status">Preview — still generating</p>}
      {chat.error && <p role="alert">The request failed.</p>}
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <article key={index}>
            <p>
              {message.content?.title} — {message.content?.author}
            </p>
            <p>Requested copies: {message.content?.copies}</p>
          </article>
        ) : null,
      )}
    </main>
  );
}
```

This interface displays the extracted data for review. It does not reserve books. Before adding a reservation action, require successful completion, check the finish reason and current request, validate inventory and counts, and authorize the server write.

For incomplete input, define an explicit clarification branch with `s.anyOf` rather than forcing the model to fill missing required fields. The [schema guide](/docs/react/concept/schema) shows tagged response alternatives.

## Explore it in the workbench

<hb-workbench lesson="structured-output">
</hb-workbench>

Let’s use the same two-step plan, this time as typed data. The model returns a title and two steps. Hashbrown parses the response as it streams, and our application renders those values.

I like keeping the example familiar. In [Generative UI](/docs/react/concept/components), the model selects `SummaryCard` from a catalog. Here, `useStructuredChat()` returns plan data and the application chooses how to display it.

### Run the same conversation

Use the [conversation workbench](/docs/react/start/workbench) with the server environment from the [Quickstart](/docs/react/start/quick). Start it with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/react.html?lesson=structured-output`. Selecting a lesson does not send a request.

The recording uses this checked React client with real provider requests. The local server keeps credentials, instructions, tools, and response schema on the server. Refresh clears the in-memory conversations and accepted plan.

### Describe the plan

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

### Request typed data

The checked React client uses `useStructuredChat()` with the plan schema, the same read-only `readContext` tool, and the capturing transport:

<hb-code-example header="react/src/StructuredWorkbench.tsx">

```ts
const chat = useStructuredChat({
  system: workbenchStructuredSystem,
  schema: getWorkbenchPlanSchema(getWorkbenchLesson(window.location.search).id),
  tools: [readContext],
  transport,
});
```

</hb-code-example>

The latest assistant message exposes its parsed plan in `content`. The application renders that data into its plan card. There is no generated component tree in this lesson.

[Read the checked React implementation](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/StructuredWorkbench.tsx). It includes the rendered card, captured origins, cancellation, and explicit acceptance.

### Watch the preview become a result

Send the first prompt. Keep **JSON** selected to see response text arrive beside the plan. The **Typed plan** section beside it shows values resolved by the SDK. Select **State** before accepting: the application still has revision `0` and no accepted plan.

<img src="/video/docs/canonical-workbench-structured-react-result.png" alt="The model streams a plain title and steps while the application renders a plan preview beside the typed data." width="1600" height="1000" loading="lazy" />

### Accept a completed plan

Select **Accept plan** after the successful response completes. The handler rechecks the plan at the action boundary, copies only validated fields, and advances the application revision. Then send “Make the second step shorter.” The tool reads the accepted plan and the response proposes a revision.

A partial response is a preview. A failed, cancelled, truncated, stale, or already accepted result cannot be applied. A failed follow-up keeps the accepted plan. Selecting a historical timeline moment cannot change live application state.

This example stores the accepted plan in browser memory. Enforce authorization and validation separately for any server write.

### Keep the response schema intact

Hashbrown sends the schema in `RunAgentInput.forwardedProps.hashbrown.responseSchema`. The [provider adapter](/docs/react/start/platforms) uses that schema, while the client parses streamed text into typed content. Hashbrown does not add an `output` tool to request structured output.

The local workbench endpoint pins its own schema for each lesson. If you customize your endpoint, preserve the schema your feature needs. The [secured text-only endpoint](/docs/react/recipes/public-endpoint) deliberately removes browser-supplied schemas as part of its different policy.

### Next steps

Use [Streaming](/docs/react/concept/streaming) to explore the streaming markers, then [Natural language forms](/docs/react/recipes/natural-language-to-structured-data) to connect typed data to a form. See [Skillet schemas](/docs/react/concept/schema) for supported schema inputs and constraints, or [Tools](/docs/react/concept/functions) to follow the plan’s context read.
