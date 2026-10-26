---
title: 'Skillet schemas: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Describe the canonical plan contract and keep schema types separate from application rules.'
---

# Skillet schemas

<hb-docs-demo demo="canonical-workbench-schemas-angular">
</hb-docs-demo>

A schema describes the data our application expects. Let’s use the same two-step plan: a title and an array of steps. We can use this contract for typed model output and inspect it beside the values Hashbrown resolves.

Skillet is exported as `s` from `@hashbrownai/core`. Its TypeScript API describes response shapes, tool arguments, and trusted component props, including which values can appear while output streams.

## Run the workbench

Start the [conversation workbench](/docs/angular/start/workbench) with `npx nx workbench-serve www`, then open `http://127.0.0.1:4370/angular.html?lesson=schemas`. Keep the server environment and provider configuration from the [Quickstart](/docs/angular/start/quick). Selecting a lesson does not start a request.

## Describe the plan

Both frameworks and the server use this shared schema:

<hb-code-example header="runtime/workbench.ts">

```ts
export const workbenchPlanSchema = s.object('A two-step plan proposal', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two concise steps',
    s.string('A clear action'),
  ),
});
```

</hb-code-example>

The descriptions tell the model what the fields mean. `s.Infer<typeof workbenchPlanSchema>` derives the TypeScript response type from this same schema.

The array is streaming, while its step strings are ordinary strings. Resolved items can appear before the response ends. The [Streaming](/docs/angular/concept/streaming) lesson also marks the title as a streaming string, so we can compare the boundaries.

## Inspect the contract and the preview

The **Schema** view shows the response contract selected for this lesson. **Details** keeps the parsed preview, application-rule check, and response status separate. A preview can match the plan rules while the response is still in progress; **Accept plan** remains disabled.

Send the first prompt, review the completed plan, and accept it. Then send the follow-up. The response uses the same contract while the data changes. A schema describes fields; it does not grant permission to change application state.

<img src="/video/docs/canonical-workbench-schemas-angular-result.png" alt="The Schema view shows the shared title and steps contract beside the parsed plan and its validation status." width="1600" height="1000" loading="lazy" />

## Keep the complete example close

The [checked Angular client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/angular/src/app/structured-workbench.ts) selects the lesson schema and passes it to `structuredChatResource()`. [Structured output](/docs/angular/concept/structured-output) explains the full request and explicit acceptance flow.

## Choose the fields your interface needs

| Value                  | Skillet example                                   |
| ---------------------- | ------------------------------------------------- |
| Text                   | `s.string('The plan title')`                    |
| Whole number           | `s.integer('The retry count')`                  |
| Number with fractions  | `s.number('The measured weight')`                 |
| True or false          | `s.boolean('Whether the item is checked')`        |
| One fixed value        | `s.literal('Draft')`                              |
| One of several strings | `s.enumeration('Priority', ['low', 'high'])`      |
| Named fields           | `s.object('A plan', { name: s.string('Name') })` |
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
const quantity = s.integer('The retry count', { minimum: 1, maximum: 20 });
const tags = s.array('Tags', s.string('One tag'), { minItems: 1, maxItems: 5 });
const username = s.string('A handle', { pattern: '^@[a-z0-9_]+$' });
```

Numeric constraints include bounds and `multipleOf`. Arrays support `minItems` and `maxItems`. Strings support `pattern` and supported `format` hints. A string's `format` is forwarded to the provider but is not validated by Hashbrown on the client; validate it in your application when required.

Keep application checks close to the action they protect. The workbench separately validates a nonempty title of at most 120 characters and exactly two nonempty steps of at most 200 characters before Accept plan. That makes the difference between the model's response contract and the application's accepted values visible. A schema does not establish ownership, permission, inventory availability, or successful completion of a run.

## Use another schema library

Hashbrown also accepts supported Standard JSON Schema objects through the `~standard` specification. It normalizes those schemas to Skillet for parsing and validation. Unsupported keywords throw; a schema accepted by another library may use constructs outside that subset.

Use `s.InferSchemaInput<T>` and `s.InferSchemaOutput<T>` when a reusable type must support both Skillet and Standard JSON Schema. For explicit conversion, use `s.fromStandardJsonSchema(schema, { mode: 'input' })` or output mode as appropriate. See the [Skillet reference](/api/core/s) for supported constructs and signatures.

## Next steps

Use [Structured output](/docs/angular/concept/structured-output) to generate and review the two-step plan with this schema. Use [Exposing components](/docs/angular/concept/components) to validate generated component props, or [Tool calling](/docs/angular/concept/functions) to describe arguments for an application function.
