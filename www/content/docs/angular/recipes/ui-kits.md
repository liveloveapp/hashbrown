---
title: 'UI Kits in Angular: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Create reusable Hashbrown UI Kits in Angular with createUiKit, trusted components, examples, fallbacks, providers, and direct rendering.'
---

# UI Kits in Angular

UI Kits package trusted components into reusable generative UI building blocks. A kit gives Hashbrown the schema it needs to generate UI and the registry it needs to render resolved UI values with Angular components.

Use UI Kits when you want to:

- Reuse the same component set across `uiChatResource()`, `uiCompletionResource()`, and direct rendering.
- Compose smaller kits into larger product kits.
- Include prompt examples with the component schema.
- Render fallback components while inputs are still streaming.
- Provide Angular dependency injection values to rendered components.

---

## 1. Create a Kit

Expose each trusted component, then pass those components to `createUiKit()`.

<hb-code-example header="product-ui-kit.ts">

```ts
import { Component, input } from '@angular/core';
import { s } from '@hashbrownai/core';
import { createUiKit, exposeComponent } from '@hashbrownai/angular';

@Component({
  selector: 'app-product-card',
  template: `
    <article>
      <h3>{{ name() }}</h3>
      <p>{{ summary() }}</p>
    </article>
  `,
})
export class ProductCard {
  name = input.required<string>();
  summary = input.required<string>();
}

export const productUiKit = createUiKit({
  components: [
    exposeComponent(ProductCard, {
      name: 'ProductCard',
      description: 'Show a product recommendation.',
      input: {
        name: s.string('Product name'),
        summary: s.streaming.string('Why this product is relevant'),
      },
    }),
  ],
});
```

</hb-code-example>

`createUiKit()` returns:

- `components`: the normalized exposed component list.
- `registry`: component definitions keyed by name.
- `schema`: the wrapper schema for UI output.
- `serializedSchema`: a stable serialized form of the schema.
- `tagNameRegistry`: the Angular renderer registry used by `<hb-render-message>`.

---

## 2. Use a Kit with UI Chat

Pass a kit wherever Hashbrown accepts `components`.

<hb-code-example header="assistant.component.ts">

```ts
import { Component } from '@angular/core';
import { RenderMessageComponent, uiChatResource } from '@hashbrownai/angular';
import { productUiKit } from './product-ui-kit';

@Component({
  selector: 'app-assistant',
  imports: [RenderMessageComponent],
  template: `
    @for (message of chat.value(); track message.id) {
      @if (message.role === 'assistant') {
        <hb-render-message [message]="message" />
      }
    }
  `,
})
export class Assistant {
  chat = uiChatResource({
    system:
      'Help the user compare products. Render product recommendations when useful.',
    components: [productUiKit],
  });
}
```

</hb-code-example>

The resource composes the kit, sends the kit schema to the model, validates complete UI output, and renders only the trusted components in the registry.

---

## 3. Compose Kits

Kits can include other kits. This lets feature teams own smaller component sets without duplicating schemas.

<hb-code-example header="commerce-ui-kit.ts">

```ts
import { createUiKit, exposeMarkdown } from '@hashbrownai/angular';
import { checkoutUiKit } from './checkout-ui-kit';
import { productUiKit } from './product-ui-kit';

export const commerceUiKit = createUiKit({
  components: [
    productUiKit,
    checkoutUiKit,
    exposeMarkdown({
      citations: true,
      caret: true,
    }),
  ],
});
```

</hb-code-example>

Component names must be unique unless they point at the same component implementation. Hashbrown throws on name collisions so a prompt cannot resolve one tag name to two different components.

---

## 4. Add Examples

Examples become part of the wrapper schema description. Use them to show good UI structure, not to list every possible component.

<hb-code-example header="product-ui-kit.ts">

```ts
import { prompt } from '@hashbrownai/core';
import { createUiKit } from '@hashbrownai/angular';

export const productUiKit = createUiKit({
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
```

</hb-code-example>

If an example references a component that is not in the kit, Hashbrown raises an error instead of silently sending bad guidance to the model.

Quoted attribute values are strings. Hashbrown converts a quoted number such as `count="3"` for a number input, but it does not parse arrays or objects out of a string. Pass any value that isn't a string with `${}`, and Hashbrown checks it against the input's schema:

<hb-code-example header="sales-ui-kit.ts">

```ts
examples: prompt`
  <ui>
    <BarChart
      title="Monthly revenue"
      data=${[
        { label: 'Oct', value: 350000 },
        { label: 'Nov', value: 400000 },
      ]}
    />
  </ui>
`,
```

</hb-code-example>

Because the example carries a real array, the `data` input can stay `s.array(...)`. There's no need to model it as a JSON-encoded string.

---

## 5. Render Directly

Use `[ui]` and `[uiKit]` when the UI value comes from somewhere other than `uiChatResource()` or `uiCompletionResource()`, such as a server response, test fixture, or saved thread.

<hb-code-example header="saved-recommendation.component.ts">

```ts
import { Component, input } from '@angular/core';
import { RenderMessageComponent } from '@hashbrownai/angular';
import type { s } from '@hashbrownai/core';
import { productUiKit } from './product-ui-kit';

@Component({
  selector: 'app-saved-recommendation',
  imports: [RenderMessageComponent],
  template: ` <hb-render-message [ui]="value()" [uiKit]="productUiKit" /> `,
})
export class SavedRecommendation {
  value = input.required<s.Infer<typeof productUiKit.schema>>();
  productUiKit = productUiKit;
}
```

</hb-code-example>

`<hb-render-message>` validates complete UI values through the kit schema and can render partial values while the UI is still streaming.

---

## 6. Add Fallback Components

Fallback components render while inputs are still streaming. Use them when the final component needs required inputs that may not be complete yet.

<hb-code-example header="product-ui-kit.ts">

```ts
import { Component, input } from '@angular/core';
import { s, type JsonResolvedValue } from '@hashbrownai/core';
import { createUiKit, exposeComponent } from '@hashbrownai/angular';

@Component({
  selector: 'app-product-card-fallback',
  template: `
    <article>
      <h3>{{ partialProps()?.['name'] ?? 'Choosing product...' }}</h3>
      <p>{{ partialProps()?.['summary'] ?? '' }}</p>
    </article>
  `,
})
export class ProductCardFallback {
  partialProps = input<Record<string, JsonResolvedValue>>();
}

export const productUiKit = createUiKit({
  components: [
    exposeComponent(ProductCard, {
      name: 'ProductCard',
      description: 'Show a product recommendation.',
      fallback: ProductCardFallback,
      input: {
        name: s.string('Product name'),
        summary: s.streaming.string('Recommendation summary'),
      },
    }),
  ],
});
```

</hb-code-example>

Fallbacks keep streaming UI stable without making every production component accept incomplete inputs.

---

## 7. Provide Dependencies

Angular kits can attach providers to exposed components. Hashbrown creates a child injector for the rendered component when providers are present.

<hb-code-example header="product-ui-kit.ts">

```ts
import { InjectionToken } from '@angular/core';
import { createUiKit, exposeComponent } from '@hashbrownai/angular';

export const PRODUCT_THEME = new InjectionToken<'compact' | 'expanded'>(
  'PRODUCT_THEME',
);

export const productUiKit = createUiKit({
  components: [
    exposeComponent(ProductCard, {
      name: 'ProductCard',
      description: 'Show a product recommendation.',
      providers: [{ provide: PRODUCT_THEME, useValue: 'compact' }],
      input: {
        name: s.string('Product name'),
        summary: s.streaming.string('Recommendation summary'),
      },
    }),
  ],
});
```

</hb-code-example>

Use providers for rendering context that belongs to the component tree, such as theme, formatting, or feature services. Keep model-authored data in `input` schemas.

---

## 8. Use a Kit with an Agent Hashbrown Doesn't Run

Sometimes another system runs the agent, such as LangGraph, CopilotKit, or your own server, and the browser only renders what it streams. The agent then has to answer with a JSON object in the kit's format, and the browser parses and renders it with the kit.

Keep each component's contract in one place. A `UiComponentDefinition` describes a component without the component itself, so the browser and the server can import the same object:

<hb-code-example header="sales-components.ts">

```ts
import { s, type UiComponentDefinition } from '@hashbrownai/core';

export const metricDefinition = {
  name: 'Metric',
  description: 'A KPI metric card.',
  props: {
    label: s.string('The metric label'),
    value: s.string('The formatted metric value'),
  },
} satisfies UiComponentDefinition;
```

</hb-code-example>

On the server, `createUiJsonSchema()` builds the JSON Schema the kit would send to a model, examples included. Pass it to your model as a structured output schema. For example, an OpenAI agent can use it as a `json_schema` response format:

<hb-code-example header="agent.ts">

```ts
import { createUiJsonSchema } from '@hashbrownai/core';
import { metricDefinition } from './sales-components';

const uiSchema = createUiJsonSchema({ components: [metricDefinition] });

const responseFormat = {
  type: 'json_schema',
  json_schema: { name: 'ui', strict: true, schema: uiSchema },
};
```

</hb-code-example>

The result is plain JSON, so an agent written in another language can load it from a file you write at build time with `JSON.stringify(uiSchema)`.

In the browser, expose the component with the same definition. Angular's `exposeComponent()` calls the props `input`. Then parse the streamed message with the kit's schema and render it:

<hb-code-example header="agent-message.component.ts">

```ts
import { Component, input } from '@angular/core';
import {
  createUiKit,
  exposeComponent,
  injectJsonParser,
  RenderMessageComponent,
} from '@hashbrownai/angular';
import { MetricComponent } from './metric.component';
import { metricDefinition } from './sales-components';

const { props, ...metric } = metricDefinition;

export const salesUiKit = createUiKit({
  components: [exposeComponent(MetricComponent, { ...metric, input: props })],
});

@Component({
  selector: 'app-agent-message',
  imports: [RenderMessageComponent],
  template: `
    @if (parser.value(); as ui) {
      <hb-render-message [ui]="ui" [uiKit]="kit" />
    }
  `,
})
export class AgentMessage {
  content = input.required<string>();
  kit = salesUiKit;
  parser = injectJsonParser(this.content, salesUiKit.schema);
}
```

</hb-code-example>

The parser resolves each component once its inputs are complete, so the first components render while the rest of the message is still streaming. When `examples` are passed, pass the same ones to both `createUiKit()` and `createUiJsonSchema()` so the two schemas stay identical.

If you can't use structured output, include the schema in the agent's instructions and ask for a single JSON object with no surrounding text. The parser can't recover from prose or code fences before the JSON.
