---
title: 'Skillet Schema Language: Hashbrown React Docs'
meta:
  - name: description
    content: 'Skillet is a Zod-like schema language that is LLM-optimized.'
---
# Skillet Schema Language

<p class="subtitle">Skillet is a Zod-like schema language that is LLM-optimized.</p>

- Skillet is strongly typed
- Skillet purposefully limits the schema to that which is supported by LLMs
- Skillet optimizes the schema for processing by an LLM
- Skillet tightly integrates streaming

---

## Methods

| Method        | Signature                    | Example                               |
| ------------- | ---------------------------- | ------------------------------------- |
| `string`      | `string(desc, constraints?)` | `s.string('name', { pattern: '^@' })` |
| `number`      | `number(desc, constraints?)` | `s.number('age', { minimum: 0 })`     |
| `integer`     | `integer(desc, constraints?)`| `s.integer('count', { maximum: 10 })` |
| `boolean`     | `boolean(desc: string)`      | `s.boolean('active')`                 |
| `literal`     | `literal<T>(value: T)`       | `s.literal('success')`                |
| `object`      | `object(desc, shape)`        | `s.object('user', {})`                |
| `array`       | `array(desc, item, constraints?)` | `s.array('items', s.string(), { minItems: 1 })` |
| `anyOf`       | `anyOf(options)`             | `s.anyOf([s.string(), s.number()])`   |
| `enumeration` | `enumeration(desc, entries)` | `s.enumeration('status', ['a', 'b'])` |
| `nullish`     | `nullish()`                  | `s.nullish()`                         |

---

## Primitive Values

<hb-code-example header="examples">

```ts
// string
s.string("The user's full name");

// number
s.number("The user's age in years");

// integer
s.integer('The number of items in the cart');

// boolean
s.boolean('Whether the user account is active');

// literal
s.literal('success');
```

</hb-code-example>

---

## Compound Values

<hb-code-example header="objects">

```ts
s.object('A user profile', {
  name: s.string("The user's name"),
  age: s.number("The user's age"),
  active: s.boolean('Whether the user is active'),
});
```

</hb-code-example>

<hb-code-example header="array">

```ts
s.array(
  'A list of users',
  s.object('A user', {
    name: s.string("The user's name"),
    email: s.string("The user's email"),
  }),
);
```

</hb-code-example>

---

## AnyOf

<hb-code-example header="anyOf">

```ts
s.anyOf([
  s.object('Success response', {
    status: s.literal('success'),
    data: s.string('The response data'),
  }),
  s.object('Error response', {
    status: s.literal('error'),
    message: s.string('The error message'),
  }),
]);
```

</hb-code-example>

---

## Enumeration

<hb-code-example header="enumeration">

```ts
s.enumeration('Task priority level', ['low', 'medium', 'high', 'urgent']);
```

</hb-code-example>

---

## Nullish

<hb-code-example header="nullish">

```ts
s.anyOf([s.string('A string value'), s.nullish()]);
```

</hb-code-example>

---

## Inferring Types

Skillet infers a static type from a schema using `s.Infer<T>`.

<hb-code-example header="infer">

```ts
// 1. define the schema
const schema = s.streaming.object('The result', {
  code: s.streaming.string('The JavaScript code to run'),
});

// 2. define static type using s.Infer<T>
type Result = s.Infer<schema>;

// 3. use the type
const mockResult: Result = {
  code: 'let i = 0',
};
```

</hb-code-example>

---

## Numeric Types

Skillet supports numeric types using either the `number()` or `integer()` function.
The `number()` function allows for floating-point numbers, while the `integer()` function restricts the value to integers.

Skillet also supports optional numeric constraints like `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, and `multipleOf`.

---

## String Constraints

```ts
s.string('Username', {
  pattern: '^@[a-z0-9_]+$',
  format: 'email',
});
```

- `pattern` is enforced in Hashbrown validation.
- `format` is forwarded to the model provider but not validated client-side.
- Supported `format` values: `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`.

---

## Numeric Constraints

```ts
s.number('Score', {
  minimum: 0,
  exclusiveMaximum: 10,
  multipleOf: 0.5,
});
```

---

## Array Constraints

```ts
s.array('Tags', s.string('Tag'), {
  minItems: 1,
  maxItems: 5,
});
```

---

## Streaming

We saved the best bite for last.
Skillet supports streaming responses out of the box.

To enable streaming, simply add the `streaming` keyword to your schema.

<hb-code-example header="streaming">

```ts
// stream strings
s.streaming.string();

// stream objects
s.streaming.object();

// stream arrays
s.streaming.array();
```

</hb-code-example>

Skillet eagerly parses fragments of the streamed response from the LLM.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="/api/core/s">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Full API Reference</h4>
      <p>Check out the full Skillet schema</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose React components to the LLM for generative UI.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/structured-output">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Get structured data from models</h4>
      <p>Use Skillet schema to describe model responses.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
