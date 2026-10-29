---
title: 'Streaming: Hashbrown React Docs'
meta:
  - name: description
    content: 'Follow raw JSON into a typed plan preview while keeping acceptance explicit.'
---

# Streaming

<hb-workbench lesson="streaming">
</hb-workbench>

We do not need to wait for the whole two-step plan before showing useful feedback. Let’s stream the title, then show steps as their values resolve. We’ll keep **Accept plan** disabled until the response finishes successfully.

I use the same conversation in [Structured output](/docs/react/concept/structured-output). Here, we’ll slow down and follow the boundary between raw text, parsed values, and application state.

## Run the workbench

Start the [conversation workbench](/docs/react/start/workbench) with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/react.html?lesson=streaming`. Keep the server environment and provider configuration from the [Quickstart](/docs/react/start/quick). Selecting a lesson does not start a request.

## Choose what can appear early

The streaming lesson uses this shared response schema:

<hb-code-example header="runtime/workbench.ts">

```ts
export const workbenchStreamingPlanSchema = s.object(
  'A two-step plan proposal',
  {
    title: s.streaming.string('A concise plan title'),
    steps: s.streaming.array(
      'Exactly two concise steps',
      s.string('A clear action'),
    ),
  },
);
```

</hb-code-example>

The title uses `s.streaming.string`, so the interface can display it before its closing quote arrives. The steps use `s.streaming.array` around ordinary strings. Each step can appear once its string value resolves; it does not need to wait for the entire array.

`useStructuredChat()` parses the incoming response with this schema. Our component renders typed content as it changes. We do not call `JSON.parse()` on each network chunk.

## Follow one response

Keep **JSON** selected. The center feed shows the plan preview, and the inspector's **Typed plan** section lists the SDK's resolved values.

| Moment | Preview | Application state |
| --- | --- | --- |
| Waiting for output | No new plan | Unchanged. |
| Title string is arriving | Partial title | Accept plan remains disabled. |
| Step strings resolve | Resolved steps appear | Still unchanged during generation. |
| Successful completion and validation | Reviewable two-step plan | Accept plan becomes available. |
| Explicit acceptance | The same plan | Revision advances from 0 to 1. |

Provider chunk sizes and timing vary. Several values may arrive together. The recording uses real React SDK requests and OpenAI output, with unchanged provider events paced at 20 ms for filming and footage slowed to half speed for readability. It does not script provider output; the normal host adds no event delay.

<img src="/video/docs/canonical-workbench-streaming-react-result.png" alt="The canonical plan preview appears beside streamed JSON and resolved values in the inspector." width="1600" height="1000" loading="lazy" />

## Follow the second turn

Accept the first plan, choose **Follow-up**, and send “Make the second step shorter.” The browser tool reads the accepted plan before the model proposes a revision. The first step stays the same; the second becomes shorter.

Use the bottom player to revisit **Streaming JSON**, **Parsed output**, and **Plan accepted**. The chat, JSON, and state follow the same captured moment. **Raw events** puts every frame on the scrubber. Replay does not call the model, execute a tool, or accept a plan.

## Keep previews separate from writes

A resolved field is useful feedback, but it does not prove that the document is complete or that the run will succeed. The application checks a nonempty title, exactly two bounded steps, the current turn and revision, and successful completion before accepting.

Stop invalidates acceptance immediately. A failed, cancelled, truncated, or stale response cannot replace the accepted plan. Stopping a client request does not undo work a server or tool has already performed.

## Pick a streaming boundary deliberately

Use streaming strings for text that is useful while it grows. Use streaming arrays for collections that can appear progressively. Use streaming objects when the interface can handle fields becoming available separately. An ordinary object can resolve once its required field values are present, even before its closing brace; that is still a preview of the full document.

For a finite local source without a provider, use the [JSON Parser](/docs/react/recipes/json-parser) recipe. For a form, continue with [Natural language forms](/docs/react/recipes/natural-language-to-structured-data).

Read the [checked React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/StructuredWorkbench.tsx), or return to [Skillet schemas](/docs/react/concept/schema) and [Exposing components](/docs/react/concept/components).
