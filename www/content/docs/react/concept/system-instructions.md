---
title: 'System instructions: Hashbrown React Docs'
meta:
  - name: description
    content: 'Give the assistant a clear task, useful context, and a response style.'
---

# System instructions

System instructions describe what we want the assistant to do throughout a conversation. In our onboarding example, we ask it to be friendly and keep each reply to one sentence.

<hb-docs-demo demo="conversation">
</hb-docs-demo>

## Before we start

Use the working text-chat example from [Messages and turns](/docs/react/concept/ai-basics). It already has a server endpoint, provider configuration, and a place to send a message.

## Start with a specific task

The `system` option in `useChat()` supplies our instructions:

```ts
system: 'You are a friendly onboarding assistant. Keep each reply to one sentence.'
```

Let's break this down:

1. **Friendly onboarding assistant** describes its role and tone.
2. **Keep each reply to one sentence** describes the response we want.
3. The user message supplies the request for the current turn.

Try changing the instruction to ask for a formal greeting. Start a fresh conversation and compare the result. Change one thing at a time so you can see which instruction affected the response.

## Add context the task needs

A more specific feature may need a few rules and an example:

```ts
system: `
  Help a developer finish their first Hashbrown app.
  Explain one next step at a time.
  Ask which framework they use if they have not said.
  Use the component names available in this application.

  Example:
  User: I have connected the endpoint. What next?
  Assistant: Create a WelcomeCard with a title and message.
`
```

Keep instructions close to the feature they support. A long list of unrelated rules makes the prompt harder to maintain and the result harder to evaluate.

## Keep user input in user messages

Send a user's request through `sendMessage()` with `role: 'user'`, as we do in the conversation example. Avoid building the system instruction by concatenating arbitrary user text into it.

If the task needs application context, describe what that context means and include only what the model needs. Clear labels and delimiters help separate instructions from data, but they do not make untrusted input safe to act on.

## Decide what the server owns

The Quickstart keeps the provider key and model selection on the server. Its client supplies the feature's system instructions.

That is useful for local development and for instructions you are comfortable showing to users. Browser code and requests can be inspected and changed. If your application requires a particular instruction, enforce that choice in the endpoint.

Create `pin-system-prompt.ts` beside the Quickstart's `server.ts`:

<hb-code-example header="pin-system-prompt.ts">

```ts
import type { RunAgentInput } from '@ag-ui/core';

/** Replaces client-supplied instructions while preserving the rest of the run. */
export function pinSystemPrompt(
  input: RunAgentInput,
  prompt: string,
): RunAgentInput {
  return {
    ...input,
    messages: [
      { id: 'server-system', role: 'system', content: prompt },
      ...input.messages.filter(
        (message) => message.role !== 'system' && message.role !== 'developer',
      ),
    ],
  };
}
```

</hb-code-example>

Import it into `server.ts`:

```ts
import { pinSystemPrompt } from './pin-system-prompt';
```

Then replace the adapter's `input` value with your server-owned instruction:

```ts
input: pinSystemPrompt(
  req.body as RunAgentInput,
  'You are a friendly onboarding assistant. Keep each reply to one sentence.',
),
```

The helper removes client-supplied system and developer messages and prepends our instruction. It preserves the user conversation, tools, and forwarded properties. For a UI feature, those forwarded properties include the response schema; keep them intact.

## Instructions do not grant permission

A prompt can ask the model to follow a rule. Your application must still enforce who may read data or perform an action. Keep secrets out of prompts, validate incoming requests, and authorize tool handlers and server operations independently of the model's response.

Continue with [Securing a public endpoint](/docs/react/recipes/public-endpoint) before deploying the local example.

## Check the behavior

Try a small set of representative requests: a normal request, a vague request, and a request outside the feature's scope. Inspect the output and adjust the instruction when the result is unclear. A single successful response does not establish how every future request will behave.

Use [Debugging](/docs/react/concept/debugging) to inspect the request and response. Then continue with [Message history](/docs/react/concept/message-history) to decide which earlier messages the next request should include.
