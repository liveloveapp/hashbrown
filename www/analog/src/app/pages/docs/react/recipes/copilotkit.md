---
title: 'Using Hashbrown with CopilotKit: Hashbrown React Docs'
meta:
  - name: description
    content: 'Use Hashbrown alongside CopilotKit to combine app-native copilot surfaces with typed structured output, streaming JSON parsing, and trusted generative UI.'
---

# Using Hashbrown with CopilotKit

CopilotKit provides agentic frontend primitives such as chat components, app context, frontend tools, and generative UI. Hashbrown fits alongside it when you want typed structured output, streaming JSON parsing, provider adapters, or trusted component rendering with Skillet schemas.

This recipe keeps the responsibilities separate:

- CopilotKit owns the copilot shell and agent runtime connection.
- Hashbrown owns deterministic structured output and trusted UI generation inside your React app.

---

## 1. Install Packages

<hb-code-example header="terminal">

```sh
npm install @copilotkit/react-core @hashbrownai/react @hashbrownai/core @hashbrownai/openai
```

</hb-code-example>

CopilotKit also needs a runtime endpoint. Their v2 docs show wrapping your app in `CopilotKit` with a `runtimeUrl`, usually pointing at your backend route.

---

## 2. Wrap the App

<hb-code-example header="AppProviders.tsx">

```tsx
import { CopilotKit } from '@copilotkit/react-core/v2';
import { HashbrownProvider } from '@hashbrownai/react';
import type { ReactNode } from 'react';
import '@copilotkit/react-core/v2/styles.css';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <HashbrownProvider url="/api/hashbrown">{children}</HashbrownProvider>
    </CopilotKit>
  );
}
```

</hb-code-example>

Use separate backend endpoints unless you intentionally build a shared route. The CopilotKit runtime speaks to CopilotKit clients; the Hashbrown endpoint should use the Hashbrown provider adapter for your model.

---

## 3. Use CopilotKit for App-Level Help

Use CopilotKit to expose app state and actions to the copilot. Keep the state small and product-specific.

<hb-code-example header="InventoryCopilot.tsx">

```tsx
import { CopilotChat, useAgentContext } from '@copilotkit/react-core/v2';

export function InventoryCopilot({
  selectedProduct,
}: {
  selectedProduct: { id: string; name: string; stock: number } | null;
}) {
  useAgentContext({
    description: 'The product currently selected by the user',
    value: selectedProduct,
  });

  return (
    <CopilotChat
      labels={{
        modalHeaderTitle: 'Inventory assistant',
        welcomeMessageText: 'Ask about the selected product.',
      }}
    />
  );
}
```

</hb-code-example>

CopilotKit's v2 docs describe `useAgentContext()` as the hook for making app state available to the agent. It replaces the v1 `useCopilotReadable()` hook.

---

## 4. Use Hashbrown for Typed Extraction

Use Hashbrown where the UI needs a typed object, not another chat turn. This example extracts a product filter from natural language.

<hb-code-example header="useProductFilter.ts">

```ts
import { s } from '@hashbrownai/core';
import { useStructuredCompletion } from '@hashbrownai/react';

const productFilterSchema = s.object('Product filter', {
  query: s.streaming.string('Search query'),
  maxPrice: s.anyOf([s.number('Maximum price in USD'), s.nullish()]),
  inStockOnly: s.boolean('Whether to show only in-stock products'),
});

export function useProductFilter(prompt: string) {
  return useStructuredCompletion({
    model: 'gpt-5',
    system: 'Convert the user request into a product search filter.',
    input: prompt,
    schema: productFilterSchema,
  });
}
```

</hb-code-example>

Hashbrown streams partial values through the schema, so the UI can update before the model finishes.

---

## 5. Use Hashbrown for Trusted Generated UI

If the model should render product-specific UI, expose only trusted components with Hashbrown.

<hb-code-example header="product-ui-kit.tsx">

```tsx
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiKit } from '@hashbrownai/react';

function ProductCard({ name, summary }: { name: string; summary: string }) {
  return (
    <article>
      <h3>{name}</h3>
      <p>{summary}</p>
    </article>
  );
}

export function useProductUiKit() {
  return useUiKit({
    components: [
      exposeComponent(ProductCard, {
        name: 'ProductCard',
        description: 'Show a product recommendation.',
        props: s.object('Product card props', {
          name: s.string('Product name'),
          summary: s.streaming.string('Why this product is relevant'),
        }),
      }),
    ],
  });
}
```

</hb-code-example>

Then render it with `useUiChat()` or `useUiCompletion()` in the part of the app where generated UI belongs.

---

## 6. Integration Guidelines

- Use CopilotKit when the experience is an assistant surface that reads app state or triggers product actions.
- Use Hashbrown when the output must be typed, streamed into existing UI, validated by schemas, or rendered through a trusted component registry.
- Keep CopilotKit frontend tools and Hashbrown tools separate unless they call the same underlying app service.
- Avoid sending the same large app state to both systems. Summarize state for the copilot and use Hashbrown tools for precise data lookup.
- Put side effects behind explicit user intent. Hashbrown tool handlers and CopilotKit frontend tools can both mutate app state, so keep authorization and confirmation rules in your app layer.
