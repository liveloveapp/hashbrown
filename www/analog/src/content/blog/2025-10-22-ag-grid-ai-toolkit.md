---
title: Controlling AG Grid with Natural Language using Hashbrown
slug: 2025-10-22-ag-grid-ai-toolkit
description: Hashbrown v0.3 introduces support for open-weight models via Ollama, MCP server integration, simplified UI schemas, new prompt helpers, and a redesigned docs site. Build generative UIs with free, open-source models.
tags:
  - story
team:
  - mike
---

AG Grid introduced the `AiToolkitModule` in v34.3.0, providing a set of utilities for connecting the grid with LLMs. The documentation walks through building a natural-language input for setting the grid state. We took AG Grid’s finance demo and paired this new toolkit with Hashbrown’s tool-calling primitives so an assistant can group, pivot, filter, and sort the grid on demand:

<div style="position: relative; padding-bottom: 64.90384615384616%; height: 0;"><iframe src="https://www.loom.com/embed/318817ba886e41f89fb174c350c1905b?sid=6962236a-1f74-4ea4-99cd-1f852ef9a5a7" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe></div>

---

You can check out the [code at this repo](https://github.com/MikeRyanDev/ag-grid-with-hashbrown) (it's under `/finance/react`). Here’s how it works and why it’s useful.

## TL;DR

- **AG Grid** exposes a machine-readable description of your grid state via `GridApi#getStructuredSchema`.
- **The app** publishes a single `updateGridState` tool that the model can call with an object conforming to that schema.
- **One atomic update**: the LLM can sort, hide, group, pivot, and aggregate in a single state change.
- **Provider-agnostic**: I’m using OpenAI here, but Hashbrown also works with other models (e.g., Ollama, Gemini, Writer, etc.) by swapping the provider.

## Step 1: Instrument the grid with AiToolkitModule

```ts
import { AiToolkitModule } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([
  // ...existing enterprise modules
  AiToolkitModule,
]);
```

## Step 2: Get the grid's schema

Grab a reference to the Grid API in an `onGridReady` event handler, then call `getStructuredSchema()` to retrieve your grid's structured schema:

```ts
const onGridReady = useCallback((params: GridReadyEvent) => {
  const schema = params.api.getStructuredSchema();
  setSchema(schema);
  setGridApi(params.api);
}, []);
```

That `schema` is the machine-readable contract between my grid and the LLM. It describes the grid's state, including which columns are visible, their sort and filter state, and the grid's grouping, pivoting, and aggregation state. AG Grid creates this schema based on the column definitions and configuration I provide.

## Step 3: Teach the assistant to change grid state

Generally, I think of working with AI as: input -> ✨ AI Magic ✨ -> output. When the AI is working on generating an output, it defaults to using the system instruction, the input value, and the output schema (if present) to decide what to return. Often, the AI needs more information or must take an action to produce an answer. Most LLM providers solve that through _tools_.

Tools provide the LLM with a collection of functions it may invoke when generating an output. In this example, I want the LLM to be able to change the grid's state. That way, if a user asks the AI to change the grid, it can examine its list of tools, see the `updateGridState` tool, call it, and use the tool's result to generate an output.

Hashbrown’s `useTool` hook lets us create tools that large language models can call. Unlike most AI SDKs (including _the_ AI SDK), Hashbrown's tools run client-side, making Hashbrown's tool-calling model ideal for calling AG Grid's API, also running on the client. Exposing a tool to the LLM is as simple as providing a name, description, schema, and an async function that executes the tool's logic:

```ts
const updateGridState = useTool({
  name: 'updateGridState',
  description: 'Update the grid state',
  schema,
  deps: [schema, gridApi],
  handler: async (result) => {
    gridApi.setState(result);
  },
});
```

For my `updateGridState` tool, I pass the schema generated from `GridApi#getStructuredSchema`. When the LLM chooses to call the tool, it generates an input object conforming to this schema. Hashbrown then invokes the tool's async handler, passing it the AI-generated input. I use that object to set the grid's state through AG Grid's API.

## Step 4: Wire up chat and streaming

The assistant itself is powered by `useChat`, which handles streaming responses and tool calls for me:

```ts
const { messages, sendMessage } = useChat({
  model: 'gpt-5',
  tools: [updateGridState],
  system: `
      You are an expert data analyst working with a data grid. 

      You should respond to user requests by calling the "updateGridState"
      tool with their requested changes to the grid state. The call should 
      include all their requested changes.

      The grid has the following features available to manipulate:
      - Column Visibility
      - Column Sizing
      - Row Grouping
      - Sorting
      - Aggregation
      - Pivoting
      - Filtering

      Response Guidelines:
       - Respond to the user's request in a friendly and helpful manner.
       - If the user's request is not clear, ask for clarification.
       - If the user's request is not possible, explain why and suggest 
         an alternative.
       - If the user's request is possible, call the "updateGridState" 
         tool to update the grid state.
    `,
});
```

## Step 5: Set up the Hashbrown proxy

In `src/main.tsx` we wrap the app in a `HashbrownProvider` that points to a tiny Express proxy running on `http://localhost:4000/api/chat`. That proxy lives in `server/index.js` and uses `HashbrownOpenAI.stream.text` to forward streaming responses from OpenAI. The proxy injects our private API key from `.env`, enforces CORS, and sets the correct headers:

```ts
app.post('/api/chat', async (req, res) => {
  const openai = HashbrownOpenAI.stream.text({
    apiKey: process.env.OPENAI_API_KEY,
    request: req.body,
    transformRequestOptions: (request) => ({
      ...request,
      reasoning_effort: 'low',
    }),
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of openai) {
    res.write(chunk);
  }

  res.end();
});
```

Because Hashbrown handles OpenAI’s low-level streaming, the frontend consumes a live list of messages returned by `useChat`, so responses appear as quickly as the LLM produces them.

## Gotchas & notes

- **Hide chat until ready.** I don’t mount the assistant until I have `schema` + `gridApi`, which are available in AG Grid's `onGridReady` event.
- **Schema freshness.** If I were to dynamically change column defs, I would need to refresh the schema I'm passing to the tool.
- **Open models.** I can use open-weight models by swapping the OpenAI adapter for the Ollama adapter.

## A conversational analyst for the finance grid

Users can type "group by instrument and aggregate by P&L" and watch the grid update in response. The assistant only speaks the grid’s vocabulary because of the schema generated by AG Grid's new AiToolkitModule. It exposes my columns, their capabilities, and the grid's capabilities as pieces of state the AI can change.

## Try it yourself

Clone the repo, run the server, open the finance demo, and type a few prompts:

- "Sort by **Ticker** ascending." – the assistant asks for direction once and applies the sort.
- "Hide **Timeline**, then group by **Instrument** and aggregate **Total Value**." – the grid hides Timeline, groups by Instrument, and rolls up Total Value in a single `updateGridState` tool call.
- "Show tickers with P&L greater than 100." – the grid filters the P&L column.

---

By the way, quick introduction! My name is Mike Ryan, and I’m the tech lead for [Hashbrown](https://hashbrown.dev), a 100% open‑source framework for building AI‑connected React and Angular components. I’m also a Principal Architect at [LiveLoveApp](https://liveloveapp.com), a consultancy focused on AG Grid and AI. Drop me a line if you need help with your project at [mike@liveloveapp.com](mailto:mike@liveloveapp.com).
