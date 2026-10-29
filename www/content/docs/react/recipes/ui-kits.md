---
title: 'UI Kits: Hashbrown React Docs'
meta:
  - name: description
    content: 'Package trusted components with reusable descriptions and prop schemas for generative UI conversations.'
---

# UI Kits

<hb-docs-demo demo="canonical-workbench-ui-kits-react">
</hb-docs-demo>

A UI kit packages components with the descriptions and prop schemas the model needs to use them. Share a kit when several conversations should use the same cards, status messages, and formatting rules. The application supplies executable components; the model selects from that catalogue and generates schema-constrained data.

Let’s package a delivery status card. We can pass the resulting kit into any UI conversation without repeating its component contract. Start with a read-only card so rendering a response has no application side effect.

<hb-concept-diagram concept="generative-ui"> </hb-concept-diagram>

## Package a delivery card

Start with the [React Quickstart](/docs/react/start/quick). The following frontend example uses its configured Hashbrown provider and same-origin `/api/chat` endpoint. Keep the provider key and model configuration on the server. Mount the component beneath `HashbrownProvider` and keep it mounted for the conversation lifetime.

```tsx
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiChat, useUiKit } from '@hashbrownai/react';

function DeliveryCard({ status }: { status: string }) {
  return (
    <article aria-label="Delivery status">
      <h2>Delivery</h2>
      <p>{status}</p>
    </article>
  );
}
const delivery = exposeComponent(DeliveryCard, {
  name: 'DeliveryCard',
  description:
    'Display a read-only delivery status. Do not use for changing an order.',
  props: { status: s.string('A short delivery status') },
  children: false,
});

export function DeliveryAssistant() {
  const kit = useUiKit({ components: [delivery] });
  const chat = useUiChat({
    system:
      'Demonstrate the delivery card with this public example: the parcel is due Friday.',
    components: [kit],
  });
  return (
    <section>
      <button
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content: 'Show the delivery status.',
          })
        }
      >
        Show delivery
      </button>
      {chat.messages.map((message) =>
        message.role === 'assistant' ? (
          <div key={message.id}>{message.ui}</div>
        ) : null,
      )}
      {chat.error && <p role="alert">The reply could not finish.</p>}
    </section>
  );
}
```

The delivery date is public example data supplied in the instructions. For a real order, retrieve its status through an authorized read-only tool and keep the authoritative result in application state. The model can misreport a tool result, so a generated status card is a presentation, not a database record.

Export the exposed component from a shared module as your catalogue grows. Compose kits through `components` rather than duplicating prop schemas. Use descriptions to distinguish similar components, and add a fallback when a component cannot render until required props resolve. Kit reuse does not authorize callbacks or make partial output safe to apply.

## Explore it in the workbench

<hb-workbench lesson="ui-kits">
</hb-workbench>

Let's put two components in one kit. We'll ask for a summary of our two-step plan, accept it, then ask for an ordered view with a shorter second step. The kit carries the same component descriptions, schemas, and renderers into both requests.

<img src="/video/docs/canonical-workbench-ui-kits-react-result.png" alt="The React workbench shows two trusted component presentations, the selected component, and the accepted plan in application state." width="1600" height="1000" loading="lazy" />

## Try the same kit twice

1. Open **UI Kits** in the [canonical workbench](/docs/react/start/workbench).
2. Send the first prompt. The read-only `readContext` tool supplies the current application plan and revision.
3. Watch `SummaryCard` render from its validated props. Select **Accept plan** after the request completes.
4. Send the follow-up. This time, ask for `StepsCard` with a shorter second step.
5. Review the new proposal, then accept it explicitly. The application revision advances again.
6. Step back through the timeline. Each captured response keeps its component name and the state that existed at that point.

The model chooses from the components we expose. It cannot introduce an arbitrary component or send executable JSX. Asking for another presentation does not add a component to the kit.

## Build once, pass the kit

The checked client exposes `SummaryCard` and `StepsCard`, then calls `useUiKit()`. Each definition describes when to use that component, its prop schemas, and its streaming fallback.

Pass the resulting kit to `useUiChat()` through `components`:

```ts
import { useUiChat, useUiKit } from '@hashbrownai/react';

const kit = useUiKit({ components: exposedComponents });
const chat = useUiChat({
  system: instructions,
  components: [kit],
  tools: [readContext],
  transport,
});
```

This is the composition point from the example. The [complete React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/UiKitWorkbench.tsx) includes the exposed components, fixed instructions, tool, transport, and lifecycle setup. The `exposedComponents`, `instructions`, `readContext`, and `transport` values in this small excerpt come from that setup. Keep these hooks at the top level of the React component.

A kit packages the trusted component contract. It does not make a component's event handler safe automatically. Our Accept handler still validates the completed original response, current request, application revision, and reviewed plan.

## Follow the boundary in the inspector

**Kit** shows safe metadata from the actual framework kit registry. **Schema** shows its serialized schema. **UI** identifies the selected component and captured props; **JSON** shows the accumulated response.

A configured fallback can render while required props are unresolved. A visible component can also keep updating while streaming fields arrive. Neither state means the request has successfully completed. Accept remains unavailable until the source and application validation permit it.

Replay displays captured values. It cannot run a generated component's callbacks, call a tool, or accept an old proposal. Returning to live restores the current conversation. Refresh clears this local example.

## Require the context step

An instruction alone does not guarantee that a model will call a tool. In this example, the server requires `readContext` before allowing a UI response. Once a successful context result belongs to the current turn, it disables further tool calls for that response.

This is the example's server policy, implemented through the OpenAI adapter. It is not automatic behavior supplied by a kit or a chat hook.

## Read the checked source

- [Server-enforced context sequence](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-ui-policy.ts).
- [React kit and UI chat client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/UiKitWorkbench.tsx).
- [Shared component contract and pinned lesson policy](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-ui-kits.ts).
- [Capture and acceptance guards](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts).

Start with [Exposing components](/docs/react/concept/components) for a single trusted component. Continue with [the UI chatbot](/docs/react/recipes/ui-chatbot) to connect a proposal, acceptance, and a read-only follow-up. [UI selection](/docs/react/recipes/ui-selection) covers a separate decision boundary.

See the [`useUiKit` API reference](/api/react/useUiKit) for the full kit contract, composition, and selectability options.
