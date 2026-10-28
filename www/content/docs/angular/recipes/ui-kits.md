---
title: 'UI Kits: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Reuse a trusted component kit, stream two plan presentations, and explicitly accept a completed proposal in the Angular workbench.'
---

# UI Kits

Let's put two components in one kit. We'll ask for a summary of our two-step plan, accept it, then ask for an ordered view with a shorter second step. The kit carries the same component descriptions, schemas, and renderers into both requests.

<hb-docs-demo demo="canonical-workbench-ui-kits-angular">
</hb-docs-demo>

<img src="/video/docs/canonical-workbench-ui-kits-angular-result.png" alt="The Angular workbench shows two trusted component presentations, the selected component, and the accepted plan in application state." width="1600" height="1000" loading="lazy" />

## Try the same kit twice

1. Open **UI Kits** in the [canonical workbench](/docs/angular/start/workbench).
2. Send the first prompt. The read-only `readContext` tool supplies the current application plan and revision.
3. Watch `SummaryCard` render from its validated props. Select **Accept plan** after the request completes.
4. Send the follow-up. This time, ask for `StepsCard` with a shorter second step.
5. Review the new proposal, then accept it explicitly. The application revision advances again.
6. Step back through the timeline. Each captured response keeps its component name and the state that existed at that point.

The model chooses from the components we expose. It cannot introduce an arbitrary component or send executable JSX. Asking for another presentation does not add a component to the kit.

## Build once, pass the kit

The checked client exposes `SummaryCard` and `StepsCard`, then calls `createUiKit()`. Each definition describes when to use that component, its prop schemas, and its streaming fallback.

Pass the resulting kit to `uiChatResource()` through `components`:

```ts
import { createUiKit, uiChatResource } from '@hashbrownai/angular';

const kit = createUiKit({ components: exposedComponents });
const chat = uiChatResource({
  system: instructions,
  components: [kit],
  tools: [readContext],
  transport,
});
```

This is the composition point from the example. The [complete Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/ui-kit-workbench.ts) includes the exposed components, fixed instructions, tool, transport, and lifecycle setup. The `exposedComponents`, `instructions`, `readContext`, and `transport` values in this small excerpt come from that setup. Create the chat resource in an Angular injection context, as the checked session service does.

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
- [Angular kit and UI chat client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/ui-kit-workbench.ts).
- [Shared component contract and pinned lesson policy](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-ui-kits.ts).
- [Capture and acceptance guards](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench.ts).

Start with [Exposing components](/docs/angular/concept/components) for a single trusted component. Continue with [the UI chatbot](/docs/angular/recipes/ui-chatbot) to connect a proposal, acceptance, and a read-only follow-up. [UI selection](/docs/angular/recipes/ui-selection) covers a separate decision boundary.

See the [`createUiKit` API reference](/api/angular/createUiKit) for the full kit contract, composition, and selectability options.
