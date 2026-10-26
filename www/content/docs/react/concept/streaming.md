---
title: 'Streaming: Hashbrown React Docs'
meta:
  - name: description
    content: 'Show resolved item values as they arrive while keeping application changes explicit.'
---

# Streaming

We do not need to wait for the whole shopping list before showing its first item. Let's stream item values into a draft while keeping **Apply list** disabled until the run finishes.

<hb-docs-demo demo="streaming-data">
</hb-docs-demo>

## Before we start

Use the checked shopping-list component from [Structured output](/docs/react/concept/structured-output). It includes the schema, endpoint setup links, loading and error states, and the explicit Apply action. No second component is needed for this page.

If you are following the Fundamentals section in order, complete the [Quickstart](/docs/react/start/quick), then read [Skillet schemas](/docs/react/concept/schema) and Structured output before returning here.

To explore parsing without an endpoint or model key, start with the [JSON Parser](/docs/react/recipes/json-parser) recipe. It streams a finite local weather response into a preview.

## Choose what can appear early

The schema marks the array as streaming while each item stays an ordinary object:

```ts
items: s.streaming.array(
  'The requested shopping items',
  s.object('A complete shopping item', {
    name: s.string('The product name'),
    quantity: s.integer('How many to add'),
  }),
);
```

The array can expose an item once its required name and quantity resolve. We do not mark the item object or its fields as streaming because the interface needs both values together. The object can resolve before its closing brace arrives; that preview does not prove the JSON document is complete.

## Follow one response

| Response stage                            | Draft list                            | Apply list                             |
| ----------------------------------------- | ------------------------------------- | -------------------------------------- |
| Waiting for the endpoint                  | No new items                          | Disabled                               |
| First item fields resolved                | Two apples                            | Disabled                               |
| Second item fields resolved               | Two apples and one loaf of bread      | Still disabled while the run is active |
| Run finished and application rules passed | Completed draft                       | Available for explicit review          |
| Request failed or was cancelled           | Any visible draft remains uncommitted | Disabled                               |

The recording uses delayed scripted events so we can see each stage. Real providers produce chunks at different speeds and may return several items together. Do not depend on a particular chunk size or pause between items.

## Render the current draft

`useStructuredChat()` updates the latest assistant content as parsing progresses. The component renders the current `items` collection with its framework's normal list rendering. It does not wait for a JSON string and call `JSON.parse()` after every network chunk.

There are two different questions here: **Can this item be displayed?** and **Can this result update application state?** Streaming controls the first. Successful completion, application validation, and the user's Apply action control the second.

## Choose a different streaming boundary

Use `s.streaming.string` when the interface can display a string as it grows. Use `s.streaming.object` when the interface can handle fields becoming available separately. Leave an object unmarked when its required field values should appear together, as each shopping item does here. The [JSON Parser](/docs/react/recipes/json-parser) recipe shows those values resolving before the closing brace and validates the full document when its local source ends.

A streaming marker does not authorize an action, validate application-specific rules, or guarantee that the run will succeed. Keep buttons that change application state tied to a completed, reviewed result.

## Handle cancellation and failure

Select **Cancel** while the draft is arriving. The example invalidates Apply immediately and stops the client run. It keeps the previously applied list. Stopping a client request does not undo work a server or tool has already performed; forward cancellation to server operations where appropriate.

For a request or parse error, inspect [Debugging](/docs/react/concept/debugging) and generate a fresh draft. Do not treat a partial result left on screen as a successful replacement.

## Next steps

Continue with [Natural language forms](/docs/react/recipes/natural-language-to-structured-data) to connect a generated draft to review and application validation. Return to [Skillet schemas](/docs/react/concept/schema) for supported schema constructs, or use [Exposing components](/docs/react/concept/components) when the model should choose which of your components to render.
