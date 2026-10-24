---
title: 'Skillet schemas: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Describe typed model responses and choose which values can stream.'
---

# Skillet schemas

A schema describes the data our application expects. We can use one for a model response, a tool argument, or the props of a trusted component. Skillet gives us a TypeScript API for those shapes and controls which values can appear while a response streams.

The recording shows a typed flight filter in ATC. Below, we will start with a smaller shopping-list schema that we can use in the next guide.

<hb-docs-demo demo="schemas">
</hb-docs-demo>

## Before we start

Complete the [Quickstart](/docs/angular/start/quick) so your application can reach its endpoint. Skillet is exported as `s` from `@hashbrownai/core`.

## Describe one useful response

```ts
import { s } from '@hashbrownai/core';

const shoppingListSchema = s.object('A shopping list draft', {
  items: s.streaming.array(
    'The requested shopping items',
    s.object('A complete shopping item', {
      name: s.string('The product name'),
      quantity: s.integer('How many to add'),
    }),
  ),
});

type ShoppingList = s.Infer<typeof shoppingListSchema>;
```

The root object contains an `items` array. Each item has a string name and integer quantity. The descriptions explain what those values mean to the model. `s.Infer<typeof shoppingListSchema>` derives the TypeScript response type from the same schema.

The streaming array can reveal complete items before the whole response finishes. Each item is an ordinary object, so the interface gets its name and quantity together. Continue with [Structured output](/docs/angular/concept/structured-output) for the complete checked example and [Streaming](/docs/angular/concept/streaming) for other streaming boundaries.

## Choose the fields your interface needs

| Value                  | Skillet example                                   |
| ---------------------- | ------------------------------------------------- |
| Text                   | `s.string('The product name')`                    |
| Whole number           | `s.integer('The item quantity')`                  |
| Number with fractions  | `s.number('The measured weight')`                 |
| True or false          | `s.boolean('Whether the item is checked')`        |
| One fixed value        | `s.literal('Draft')`                              |
| One of several strings | `s.enumeration('Priority', ['low', 'high'])`      |
| Named fields           | `s.object('An item', { name: s.string('Name') })` |
| Repeated values        | `s.array('Tags', s.string('One tag'))`            |

An object describes the fields in its shape. If the interface supports different response kinds, give each kind an explicit literal tag:

```ts
const responseSchema = s.anyOf([
  s.object('A draft', {
    type: s.literal('Draft'),
    name: s.string('The proposed name'),
  }),
  s.object('A clarification request', {
    type: s.literal('Clarification'),
    question: s.string('What we need to ask the user'),
  }),
]);
```

Your interface can branch on `type`. This is useful when the model should ask for missing information instead of inventing a required value. Use `s.nullish()` as a branch when your contract explicitly permits a nullish value.

## Add constraints deliberately

```ts
const quantity = s.integer('The item quantity', { minimum: 1, maximum: 20 });
const tags = s.array('Tags', s.string('One tag'), { minItems: 1, maxItems: 5 });
const username = s.string('A handle', { pattern: '^@[a-z0-9_]+$' });
```

Numeric constraints include bounds and `multipleOf`. Arrays support `minItems` and `maxItems`. Strings support `pattern` and supported `format` hints. A string's `format` is forwarded to the provider but is not validated by Hashbrown on the client; validate it in your application when required.

Keep application checks close to the action they protect. The shopping-list guide separately validates quantities, trimmed names and item count before Apply. That makes the difference between the model's response contract and the application's accepted values visible. A schema does not establish ownership, permission, inventory availability, or successful completion of a run.

## Use another schema library

Hashbrown also accepts supported Standard JSON Schema objects through the `~standard` specification. It normalizes those schemas to Skillet for parsing and validation. Unsupported keywords throw; a schema accepted by another library may use constructs outside that subset.

Use `s.InferSchemaInput<T>` and `s.InferSchemaOutput<T>` when a reusable type must support both Skillet and Standard JSON Schema. For explicit conversion, use `s.fromStandardJsonSchema(schema, { mode: 'input' })` or output mode as appropriate. See the [Skillet reference](/api/core/s) for supported constructs and signatures.

## Next steps

Use [Structured output](/docs/angular/concept/structured-output) to generate and review a shopping-list draft with this schema. Use [Exposing components](/docs/angular/concept/components) to validate generated component props, or [Tool calling](/docs/angular/concept/functions) to describe arguments for an application function.
