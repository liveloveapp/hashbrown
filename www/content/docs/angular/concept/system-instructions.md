---
title: 'System instructions: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Define a focused assistant task and keep trusted policy at the server boundary.'
---

# System instructions

<hb-docs-demo demo="canonical-workbench-system-instructions-angular">
</hb-docs-demo>

System instructions describe the assistant’s job, relevant context, and response expectations across turns. A user message asks for the work in the current turn. Keeping those roles separate makes instructions easier to test and keeps an end user’s text from becoming trusted application policy.

Start with a specific task and a small amount of relevant context. Add constraints when examples show they are needed. Browser configuration is useful for feature behavior, but policy your application relies on belongs in your endpoint. Instructions guide a model; authentication, authorization, and validation must still be enforced by code.

<hb-concept-diagram concept="client-server"> </hb-concept-diagram>

## Give a feature one clear job

Use the endpoint and client configuration from the [Quickstart](/docs/angular/start/quick). Keep `provideHashbrown` in `appConfig` and the `<app-root>` host. Import the standalone class below into `main.ts` and pass it to `bootstrapApplication()` with that same `appConfig`.

This example keeps feature guidance fixed and sends the request as a user message. Try an ordinary request, a vague request, and an unrelated request when evaluating the instruction.

```ts
import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-root',
  template: `
    <button
      type="button"
      [disabled]="chat.isLoading()"
      (click)="
        chat.sendMessage({
          role: 'user',
          content: 'Suggest a short classic novel for our book club.',
        })
      "
    >
      Ask
    </button>
    @if (chat.isLoading()) {
      <p role="status">Waiting for a reply…</p>
    }
    @if (chat.error()) {
      <p role="alert">The request failed. Check the endpoint.</p>
    }
    @for (message of chat.value(); track $index) {
      @if (message.role === 'user' || message.role === 'assistant') {
        <p>{{ message.role }}: {{ message.content }}</p>
      }
    }
  `,
})
export class ReadingGuide {
  readonly chat = chatResource({
    system:
      'Help readers choose a classic novel. Ask one question when preferences are unclear. Give a short explanation and do not claim to reserve books.',
  });
}
```

For server-owned policy, normalize the request before passing it to the adapter. This complete helper requires `@ag-ui/core` in the server project. Call it with an authenticated, validated `RunAgentInput` and a prompt selected by your endpoint; the browser must not choose the trusted policy.

```ts
import type { RunAgentInput } from '@ag-ui/core';

export function withReadingPolicy(input: RunAgentInput): RunAgentInput {
  return {
    ...input,
    messages: [
      {
        id: 'reading-policy',
        role: 'system',
        content:
          'Help choose books from our catalog. Do not claim a reservation was made.',
      },
      ...input.messages.filter(
        (message) => message.role !== 'system' && message.role !== 'developer',
      ),
    ],
  };
}
```

Use `input: withReadingPolicy(validatedInput)` in your existing server adapter call. This is the policy transformation only; keep the Quickstart HTTP handler, streaming response, cancellation, and server credentials. Removing client system messages does not authorize tools or data access.

## Explore it in the workbench

<hb-workbench lesson="system-instructions">
</hb-workbench>

System instructions describe the assistant's task across a conversation. The user message asks for the work we want in the current turn. Let's inspect both while we explain our two-step plan.

Here the application supplies a fixed copy of the plan as context. The endpoint owns that policy; the browser supplies the current user request. The recording follows the real Angular text-chat API and OpenAI adapter.

### Inspect the instruction that reaches the provider

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

### Start with a specific task

Our policy gives the assistant a task, the plan data it needs, and a response style. The current user message asks which part to explain.

Keep that guidance close to the feature. Start with the smallest instruction that describes the expected behavior, then try a normal request, an unclear request, and an out-of-scope request. Change one thing at a time when the result needs work.

For local configuration, `chatResource()` accepts a `system` option, as in [Messages and turns](/docs/angular/concept/ai-basics). Browser configuration is visible and can be changed. Put policy your application depends on in the endpoint.

### Pin policy in your own endpoint

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

### Keep instructions and permissions separate

Send user text as a user message. Avoid building trusted policy by concatenating arbitrary user input into it. Include only the application context the task needs.

A prompt describes behavior. Your application still owns authorization for reading data and performing actions. Enforce those permissions in tool handlers and server operations; a model response does not grant them.

This lesson explains a plan without changing it. Continue with [Tool calling](/docs/angular/concept/functions) to read current application state, or [Request transformation](/docs/angular/concept/transform-request-options) to inspect provider options after mapping.
