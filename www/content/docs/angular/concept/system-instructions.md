---
title: 'System instructions: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Separate user requests, browser configuration, and server-owned policy at the actual provider boundary.'
---

# System instructions

System instructions describe the assistant's task across a conversation. The user message asks for the work we want in the current turn. Let's inspect both while we explain our two-step plan.

<hb-docs-demo demo="canonical-workbench-system-instructions-angular">
</hb-docs-demo>

Here the application supplies a fixed copy of the plan as context. The endpoint owns that policy; the browser supplies the current user request. The recording follows the real Angular text-chat API and OpenAI adapter.

## Inspect the instruction that reaches the provider

Start the [workbench](/docs/angular/start/workbench), then open `http://127.0.0.1:4370/angular.html?lesson=system-instructions`.

1. Send **First prompt** to ask for the application plan.
2. In **Instructions**, compare the browser declaration with the effective public policy.
3. Send **Follow-up** to ask for the first step. Inspect the policy captured for this new request.
4. Step back through the timeline. The selected request, text, policy evidence, and state update together. Replay does not call the provider.

The browser deliberately declares a different task:

<hb-code-example header="runtime/workbench-onboarding.ts">

```ts
export const workbenchBrowserInstructions =
  'Explain a plan for planting a garden. Its steps are buy seeds and water them.';
```

</hb-code-example>

The endpoint replaces browser-supplied system and developer messages with this application policy:

<hb-code-example header="runtime/workbench-onboarding.ts">

```ts
export const workbenchInstructionsSystem =
  'Explain the fixed application-owned plan in concise plain text. The plan is "Show how a model renders trusted UI". Its two steps are "Outline the trusted UI demo." and "Record the demo." Use this plan as the application context on every turn. Do not call tools or claim that application state changed.';
```

</hb-code-example>

The inspector's **effective** value is captured from the actual mapped provider input inside the adapter callback. It includes only this known public policy, with its origin labelled. It is not a promise inferred from the browser configuration.

<img src="/video/docs/canonical-workbench-system-instructions-angular-result.png" alt="The Angular Instructions inspector compares a browser declaration with the public server policy observed at the OpenAI adapter mapping." width="1600" height="1000" loading="lazy" />

## Start with a specific task

Our policy gives the assistant a task, the plan data it needs, and a response style. The current user message asks which part to explain.

Keep that guidance close to the feature. Start with the smallest instruction that describes the expected behavior, then try a normal request, an unclear request, and an out-of-scope request. Change one thing at a time when the result needs work.

For local configuration, `chatResource()` accepts a `system` option, as in [Messages and turns](/docs/angular/concept/ai-basics). Browser configuration is visible and can be changed. Put policy your application depends on in the endpoint.

## Pin policy in your own endpoint

Use the text conversation from [Messages and turns](/docs/angular/concept/ai-basics) with the Quickstart endpoint. Create `pin-system-prompt.ts` beside `server.ts`:

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

Import the helper into `server.ts`:

```ts
import { pinSystemPrompt } from './pin-system-prompt';
```

Define your server-owned policy there, then replace the adapter's `input` value:

```ts
input: pinSystemPrompt(
  req.body as RunAgentInput,
  'Explain our two-step plan: outline the trusted UI demo, then record it. Keep replies concise.',
),
```

The helper creates a new request with our policy and preserves the rest of the run. It removes browser-supplied system and developer messages, keeping the user conversation, identifiers, tools, and forwarded properties intact. The workbench endpoint additionally validates its bounded lesson contract before calling the adapter.

## Keep instructions and permissions separate

Send user text as a user message. Avoid building trusted policy by concatenating arbitrary user input into it. Include only the application context the task needs.

A prompt describes behavior. Your application still owns authorization for reading data and performing actions. Enforce those permissions in tool handlers and server operations; a model response does not grant them.

This lesson explains a plan without changing it. Continue with [Tool calling](/docs/angular/concept/functions) to read current application state, or [Request transformation](/docs/angular/concept/transform-request-options) to inspect provider options after mapping.
