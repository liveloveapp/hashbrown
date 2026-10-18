---
title: 'Securing a Public Endpoint: Hashbrown React Docs'
meta:
  - name: description
    content: 'Pin the system prompt, tools and UI response schema on the server, and bound every request to a public chat endpoint.'
---

# Securing a Public Endpoint

<p class="subtitle">Pin the system prompt, tools and UI response schema on the server, and bound every request to a public chat endpoint.</p>

This recipe uses the server of [atc](https://github.com/liveloveapp/hashbrown/tree/main/examples/atc), Hashbrown's example app, as the worked example. The server code below is from `examples/atc/server/src/run-handler.ts`.

---

## The browser is untrusted

`useUiChat` sends everything the model needs in each run request: the messages, the system prompt, the tools and the UI response schema. Your app builds that request, but anyone can send any request to your endpoint with `curl`. A server that forwards the request as it arrives lets a stranger use your provider key for any prompt, any tools and any output.

The fix is to decide on the server what the model sees, and to treat the request as a list of user messages and nothing more.

---

## Pin what the model sees, on the server

### The system prompt

Drop every system and developer message the browser sent, and put the server's prompt first:

<hb-code-example header="run-handler.ts">

```ts
export function pinSystemPrompt(
  input: RunAgentInput,
  prompt: string,
): RunAgentInput {
  return {
    ...input,
    messages: [
      { id: 'atc-system', role: 'system', content: prompt },
      ...input.messages.filter(
        (message) => message.role !== 'system' && message.role !== 'developer',
      ),
    ],
  };
}
```

</hb-code-example>

### The tools

Tools run in the browser, so the browser decides which tools a run has. The server decides what each one says. Build each tool as the model sees it from the same definitions the browser uses, then replace every tool the browser sent with the server's copy and drop the ones the server does not know:

<hb-code-example header="run-handler.ts">

```ts
const PINNED_TOOLS: ReadonlyMap<string, Tool> = new Map(
  Object.values(ATC_TOOL_DEFINITIONS).map(
    ({ name, description, schema }): [AtcToolName, Tool] => [
      name,
      // The same conversion Hashbrown's client applies to a tool's schema.
      { name, description, parameters: s.toJsonSchema(schema) },
    ],
  ),
);

export function pinTools(tools: readonly Tool[]): Tool[] {
  const names = new Set(tools.map((tool) => tool.name));

  return [...names].flatMap((name) => {
    const pinned = PINNED_TOOLS.get(name);

    return pinned === undefined ? [] : [pinned];
  });
}
```

</hb-code-example>

### The UI response schema

The response schema lists the components the model may render and their props. Build it on the server with `createUiJsonSchema` from `@hashbrownai/core`, passing the same component definitions, in the same order, that the browser passes to `exposeComponent`. `exposeMarkdown` builds from `markdownComponent()`, so pass that too, with the same `name`, `description` and `citations` options if you set any:

<hb-code-example header="run-handler.ts">

```ts
export const PINNED_RESPONSE_SCHEMA = createUiJsonSchema({
  components: [
    markdownComponent(),
    { ...flightCardContract, children: false },
    { ...arrivalsBoardContract, children: false },
    { ...aircraftCompareContract, children: false },
    { ...airportCardContract, children: false },
  ],
});

const PINNED_RESPONSE_SCHEMA_JSON = JSON.stringify(PINNED_RESPONSE_SCHEMA);

export function pinResponseSchema(input: RunAgentInput): RunAgentInput {
  const { hashbrown } = input as UiRunInput;
  if (hashbrown?.responseSchema === undefined) {
    return input;
  }
  if (
    JSON.stringify(hashbrown.responseSchema) !== PINNED_RESPONSE_SCHEMA_JSON
  ) {
    console.warn(
      '[atc] replaced a response schema that differs from the pinned one',
    );
  }

  return {
    ...input,
    hashbrown: { ...hashbrown, responseSchema: PINNED_RESPONSE_SCHEMA },
  } as UiRunInput;
}
```

</hb-code-example>

The schema is pinned when the browser sends one. A request that leaves out `hashbrown.responseSchema` reaches the model with no schema and gets free-form text back, still under the pinned prompt, the pinned tools, the output cap and the rate limit.

### Share the definitions

The browser and the server must agree byte for byte, or every request logs a difference. atc keeps the component contracts, the tool definitions and the system prompt in a shared package (`@atc/shared`). The browser exposes each component from its contract:

<hb-code-example header="assistant.tsx">

```tsx
const components = [
  exposeMarkdown({ className: 'atc-prose' }),
  exposeComponent(FlightCard, {
    name: flightCardContract.name,
    description: flightCardContract.description,
    props: flightCardContract.props,
    fallback: FlightCardFallback,
    children: false,
  }),
  // ...the other three components
];
```

</hb-code-example>

The server applies all three pins before calling the model:

<hb-code-example header="run-handler.ts">

```ts
const stream = HashbrownOpenAI.stream.text({
  apiKey: options.apiKey,
  baseURL: options.baseURL,
  model: options.model,
  input: pinSystemPrompt(
    pinResponseSchema({ ...input, tools: pinTools(input.tools ?? []) }),
    SYSTEM_PROMPT,
  ),
  signal: abortController.signal,
  transformRequestOptions: (request) => limitRequest(request, reasoningEffort),
});
```

</hb-code-example>

---

## Replace, don't reject

Each pin replaces what the browser sent instead of returning an error. A rejection stops no attacker, who just sends the expected values, and it breaks real users still running an older build of your app after a deploy. Log the difference instead, as `pinResponseSchema` does, and never log the payload itself: it is untrusted and can be large.

---

## Bound each request

Pinning fixes what the model sees. Limits fix what a request can cost. atc caps the request body at 256 KiB, and the number and size of messages:

<hb-code-example header="run-handler.ts">

```ts
const MAX_MESSAGES = 100;

const MAX_MESSAGE_CHARS = 16_000;

function isTooLarge(input: RunAgentInput): boolean {
  return (
    input.messages.length > MAX_MESSAGES ||
    input.messages.some(
      (message) => JSON.stringify(message).length > MAX_MESSAGE_CHARS,
    )
  );
}
```

</hb-code-example>

A request over either limit gets a 413 before it reaches the provider. `limitRequest` caps the answer's length on the provider request itself, through `transformRequestOptions`:

<hb-code-example header="run-handler.ts">

```ts
const MAX_OUTPUT_TOKENS = 4096;

export function limitRequest(
  request: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  reasoningEffort: ReasoningEffort | null,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming {
  return {
    ...request,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    ...(reasoningEffort !== null && REASONING_MODEL.test(request.model)
      ? { reasoning_effort: reasoningEffort }
      : {}),
  };
}
```

</hb-code-example>

Set the model on the server too. atc reads it from `OPENAI_MODEL` and ignores anything the browser sends.

---

## Outside the code

- **Rate-limit the route.** atc's hosted app allows 40 requests a minute per IP on `POST /api/run`, set as a Vercel Firewall rule. One question makes 3 to 5 requests, one per tool round trip.
- **Cap the provider key's budget.** Use a dedicated project key with a hard monthly budget, so a bug or an abuser cannot spend past it.

---

## See it in atc

Read the full handler, its tests and the shared definitions in [examples/atc](https://github.com/liveloveapp/hashbrown/tree/main/examples/atc), starting at `server/src/run-handler.ts`.
