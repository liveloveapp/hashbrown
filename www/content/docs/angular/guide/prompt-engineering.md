---
title: 'Prompt Engineering: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Write clear instructions, provide useful context, and check responses against an application-owned contract.'
---

# Prompt Engineering

<hb-docs-demo demo="canonical-workbench-system-instructions-angular">
</hb-docs-demo>

A prompt is the instruction and context we give a model for a task. Good prompts tell it what to do, what information to use, and what to do when that information is missing. They also fit the interface we are building.

Let's start with a support assistant. Its job is to explain a supplied order status. It should ask for clarification when the order is unknown, and it should never claim that reading an order changed it.

<hb-diagram diagram="prompt-context-boundary"> </hb-diagram>

<a id="system-prompts"></a>

## Describe a bounded task

Keep the durable instruction separate from the user's latest request. This constant can be used in an ordinary Angular application; it has no workbench dependency.

```ts
export const supportInstructions = `
Help the user understand their order status.
Use only order details supplied in this conversation or returned by a tool.
If the order is unknown, ask for the order number.
Explain the current status in plain language and give one useful next step.
Do not claim that you changed, cancelled, or refunded an order.
`;
```

The instruction describes a role, an evidence boundary, missing-information behavior, and an output style. A broad instruction such as “be helpful” leaves each of those decisions to the model.

## Connect the instruction to a conversation

This focused client example assumes the endpoint configuration from the [Quickstart](/docs/angular/start/quick). Save the constant above as `support-instructions.ts`. It configures model behavior; it is not an access-control rule.

```ts
import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { supportInstructions } from './support-instructions';

@Component({
  selector: 'app-support-chat',
  template: `
    <section aria-label="Order support">
      @for (message of chat.value(); track $index) {
        <p>{{ message.content }}</p>
      }
      <button [disabled]="chat.isLoading()" (click)="ask()">
        Ask about dispatch
      </button>
      @if (chat.error()) {
        <p role="alert">The request failed. Please try again.</p>
      }
    </section>
  `,
})
export class SupportChat {
  readonly chat = chatResource({ system: supportInstructions });

  ask() {
    this.chat.sendMessage({
      role: 'user',
      content: 'What does awaiting dispatch mean?',
    });
  }
}
```

A browser instruction can be inspected or changed by its user. Pin required policy at the server boundary, authorize tool handlers, and validate application actions independently. See [System instructions](/docs/angular/concept/system-instructions) and [Public endpoints](/docs/angular/recipes/public-endpoint).

<a id="message-history"></a>
<a id="structured-prompts"></a>
<a id="tool-use"></a>
<a id="ui-driven-prompts"></a>

## Give context a clear source

Conversation history supplies earlier messages. A read-only tool can supply current application facts. Describe where those facts came from, and distinguish a user's quoted text from an application instruction. Avoid sending unrelated or sensitive data merely because it is available.

For a typed result, use a [Skillet schema](/docs/angular/concept/schema). For a generated interface, expose [trusted components](/docs/angular/concept/components). Prompt wording helps describe the task; schemas and application checks define how the result can be used.

<a id="debugging-prompts"></a>

## Evaluate a prompt with examples

Try a known order, a missing order, contradictory user input, and a request to perform an unsupported action. Keep the actual output and check it against explicit expectations. Change one part of the prompt at a time so you can explain what improved.

A schema-shaped response can still contain an incorrect claim. Check important facts against an authoritative source, and handle failures without substituting a successful-looking answer.

<a id="summary"></a>

## Explore it in the workbench

Open the **System instructions** lesson in the [workbench](/docs/angular/start/workbench). The example changes domains from support to the shared two-step plan, but the separation of user request and server policy is the same.

<hb-workbench-launcher lesson="system-instructions">
</hb-workbench-launcher>

Inspect the declared browser instruction in **Requests**, then the safe effective policy captured at the real provider-mapping boundary. Send a request that conflicts with the configured task and observe the actual response. The capture shows what reached that boundary; a model's response alone does not prove that server policy was applied.

Continue with [Debugging](/docs/angular/concept/debugging) to follow failures and [Request transformation](/docs/angular/concept/transform-request-options) to inspect server-owned customization.
