---
title: 'UI Kits in React: Hashbrown React Docs'
meta:
  - name: description
    content: 'Create reusable Hashbrown UI Kits in React with useUiKit, trusted components, examples, fallbacks, and direct rendering.'
---

# UI Kits in React

UI Kits package trusted components into reusable generative UI building blocks. A kit gives Hashbrown the schema it needs to generate UI and the renderer it needs to turn a resolved UI value into React elements.

Use UI Kits when you want to:

- Reuse the same component set across `useUiChat()`, `useUiCompletion()`, and direct rendering.
- Compose smaller kits into larger product kits.
- Include prompt examples with the component schema.
- Render fallback components while props are still streaming.
- Validate UI generated outside of a Hashbrown chat hook.

---

## 1. Create a Kit

Expose each trusted component, then pass those components to `useUiKit()`.

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
        props: {
          name: s.string('Product name'),
          summary: s.streaming.string('Why this product is relevant'),
        },
      }),
    ],
  });
}
```

</hb-code-example>

`useUiKit()` returns:

- `components`: the normalized exposed component list.
- `registry`: component definitions keyed by name.
- `schema`: the wrapper schema for UI output.
- `serializedSchema`: a stable serialized form of the schema.
- `render(value)`: a React renderer for resolved UI wrapper values.

---

## 2. Use a Kit with UI Chat

Pass a kit wherever Hashbrown accepts `components`.

<hb-code-example header="Assistant.tsx">

```tsx
import { useUiChat } from '@hashbrownai/react';
import { useProductUiKit } from './product-ui-kit';

export function Assistant() {
  const productKit = useProductUiKit();
  const { messages, sendMessage } = useUiChat({
    model: 'gpt-5',
    system:
      'Help the user compare products. Render product recommendations when useful.',
    components: [productKit],
  });

  return (
    <ChatView
      messages={messages}
      onSubmit={(message) => sendMessage(message)}
    />
  );
}
```

</hb-code-example>

The hook composes the kit, sends the kit schema to the model, validates complete UI output, and renders only the trusted components in the registry.

---

## 3. Compose Kits

Kits can include other kits. This lets feature teams own smaller component sets without duplicating schemas.

<hb-code-example header="commerce-ui-kit.tsx">

```tsx
import { exposeMarkdown, useUiKit } from '@hashbrownai/react';
import { useProductUiKit } from './product-ui-kit';
import { useCheckoutUiKit } from './checkout-ui-kit';

export function useCommerceUiKit() {
  const productKit = useProductUiKit();
  const checkoutKit = useCheckoutUiKit();

  return useUiKit({
    components: [
      productKit,
      checkoutKit,
      exposeMarkdown({
        citations: true,
        caret: true,
      }),
    ],
  });
}
```

</hb-code-example>

Component names must be unique unless they point at the same component implementation. Hashbrown throws on name collisions so a prompt cannot resolve one tag name to two different components.

---

## 4. Add Examples

Examples become part of the wrapper schema description. Use them to show good UI structure, not to list every possible component.

<hb-code-example header="product-ui-kit.tsx">

```tsx
import { prompt } from '@hashbrownai/core';
import { useUiKit } from '@hashbrownai/react';

export function useProductUiKit() {
  return useUiKit({
    components: [productCard],
    examples: prompt`
      <ui>
        <ProductCard
          name="Trail Mix"
          summary="High-protein snack with a balanced calorie profile."
        />
      </ui>
    `,
  });
}
```

</hb-code-example>

If an example references a component that is not in the kit, Hashbrown raises an error instead of silently sending bad guidance to the model.

---

## 5. Render Directly

Use `kit.schema` and `kit.render()` when the UI value comes from somewhere other than `useUiChat()` or `useUiCompletion()`, such as a server response, test fixture, or saved thread.

<hb-code-example header="SavedRecommendation.tsx">

```tsx
import type { s } from '@hashbrownai/core';
import { useProductUiKit } from './product-ui-kit';

export function SavedRecommendation({
  value,
}: {
  value: s.Infer<ReturnType<typeof useProductUiKit>['schema']>;
}) {
  const kit = useProductUiKit();

  return <>{kit.render(value)}</>;
}
```

</hb-code-example>

`render()` validates the UI once all props and children are complete. While the UI is still streaming, it renders the best partial value it can.

---

## 6. Add Fallback Components

Fallback components render while props are still streaming. Use them when the final component needs required props that may not be complete yet.

<hb-code-example header="product-ui-kit.tsx">

```tsx
import type { ComponentFallbackProps } from '@hashbrownai/core';
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiKit } from '@hashbrownai/react';

function ProductCard({ name, summary }: { name: string; summary: string }) {
  return (
    <article>
      {name}: {summary}
    </article>
  );
}

function ProductCardFallback({ partialProps }: ComponentFallbackProps) {
  return (
    <article>
      <h3>{String(partialProps?.name ?? 'Choosing product...')}</h3>
      <p>{String(partialProps?.summary ?? '')}</p>
    </article>
  );
}

export function useProductUiKit() {
  return useUiKit({
    components: [
      exposeComponent(ProductCard, {
        name: 'ProductCard',
        description: 'Show a product recommendation.',
        fallback: ProductCardFallback,
        props: {
          name: s.string('Product name'),
          summary: s.streaming.string('Recommendation summary'),
        },
      }),
    ],
  });
}
```

</hb-code-example>

Fallbacks keep streaming UI stable without making every production component accept incomplete props.
