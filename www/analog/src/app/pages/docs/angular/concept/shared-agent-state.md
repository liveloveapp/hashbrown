---
title: 'Shared Agent State: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Synchronize JSON-compatible application state with an AG-UI agent in Angular.'
---

# Shared Agent State

<p class="subtitle">Share structured state with an AG-UI agent and react to its updates.</p>

Shared agent state is a JSON-compatible value owned by the Hashbrown runtime. The runtime sends the current committed value with each new AG-UI run and applies state snapshots and deltas returned by the agent.

Use shared state for structured context that both your application and an AG-UI agent need to read or update, such as a selected account, workflow progress, or form data.

---

## Initialize State

Pass an initial `state` value when you create a runtime-backed chat or completion resource. This works with `chatResource`, `structuredChatResource`, `completionResource`, `structuredCompletionResource`, `uiChatResource`, and `uiCompletionResource`.

<hb-code-example header="account-assistant.component.ts">

```ts
import { Component } from '@angular/core';
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-account-assistant',
  standalone: true,
  template: `
    <button type="button" (click)="selectAnotherAccount()">
      Open {{ chat.state()?.selectedAccountId }}
    </button>
  `,
})
export class AccountAssistantComponent {
  readonly chat = chatResource({
    system: 'Help manage the selected account.',
    state: { selectedAccountId: 'account-123' },
  });

  selectAnotherAccount() {
    this.chat.setState({ selectedAccountId: 'account-456' });
    this.chat.sendMessage({ role: 'user', content: 'Show the new account.' });
  }
}
```

</hb-code-example>

TypeScript infers the shared state type from the initial value. In this example, `chat.state()` has the type `{ selectedAccountId: string } | undefined`, and future calls to `setState` must provide a compatible value. If you omit the initial state, `chat.state()` starts as `undefined`.

The initial `state` option is a plain value, not a signal or other reactive option. After initialization, the resource owns the value and exposes it through the `chat.state` signal. Templates, computed signals, and effects that read `chat.state()` react to agent updates.

---

## Replace State with `setState`

`setState` replaces the complete shared value. It does not merge objects and does not start a generation.

When an agent should respond to a local state change, update the state first and then explicitly call `sendMessage`, as in the example above. A state change by itself produces no request.

The value must be JSON-compatible:

- `null`, strings, booleans, and finite numbers
- Arrays of JSON-compatible values
- Plain objects whose values are JSON-compatible

Omitting the initial state represents absent state. Nested `undefined` values, sparse arrays, functions, symbols, bigints, cycles, non-finite numbers, and class instances such as `Date` are rejected instead of being silently converted. Invalid initial or replacement values throw synchronously and preserve the previous state.

---

## State During a Generation

Agent state updates are visible as they stream. A `STATE_SNAPSHOT` replaces the live draft, while a `STATE_DELTA` patches it. A successful AG-UI run commits the final draft.

If an attempt fails, is cancelled, is retired, or will be retried, Hashbrown rolls the visible state back to the value at the start of that attempt. A retry starts from the same committed checkpoint, so partial changes from a failed attempt do not leak into the next request.

To prevent a local write from racing with agent-authored deltas, `setState` throws synchronously after a logical generation is scheduled and until that generation settles. The lock includes debounce, transport attempts, retry backoff, and retries. Local tool execution happens outside this lock; a continuation locks state again when its next generation is scheduled.

---

## State and Model Prompts

Shared state travels in the AG-UI run input. Hashbrown's direct provider adapters continue to build model requests from supported message and tool content; they do not serialize shared state into a system instruction or other prompt message.

If the model itself needs a fact from shared state, explicitly include that fact in message or tool content, or use an agent implementation that reads the AG-UI state field.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/message-history">
    <div>
      <hb-message />
    </div>
    <div>
      <h4>Message History</h4>
      <p>Persist, replace, and understand synchronized conversation history.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/system-instructions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>System Instructions</h4>
      <p>Keep durable model behavior separate from shared application state.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
