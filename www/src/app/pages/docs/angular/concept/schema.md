# Skillet Schema Language

Skillet is a Zod-like schema language that is LLM-optimized.
What does that mean?

- Skillet is strongly typed.
- Skillet purposefully limits the schema to that which is supported by LLMs
- Skillet optimizes the schema for processing by an LLM
- Skillet tightly integrates streaming

---

## API Reference

We think the best way to get started with hashbrown's skillet schema language is to check out the API reference section.

[Read the API reference for Skillet](/api/core/s).

---

## Defining a Schema

Let's define our first schema.
In this example, we want the LLM to respond with an array of light objects.

```ts
s.array(
  'The lights to add to the scene',
  s.object('A join between a light and a scene', {
    lightId: s.string('the ID of the light to add'),
    brightness: s.number('the brightness of the light from 0 to 100'),
  }),
);
```

Let's break this down.

- The `s.array` function defines an array schema.
- The first argument is a description of the array.
- The second argument is the schema for the items in the array.
- The `s.object` function defines an object schema.
- The first argument is a description of the object.
- The second argument is an object that defines the properties of the object.
- The `s.string` and `s.number` functions define string and number schemas, respectively.

If you're familiar with Zod, this should look and feel _very_ similar.

---

## Enums

Skillet supports enums.
Let's look at a simple example of using this for a recurrence rule.

```ts
s.object('rrule', {
  freq: s.enumeration('Recurrence frequency (FREQ)', ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
});
```

---

## AnyOf

Skillet a logical OR using the `anyOf()` function.
This is similar to [Zod's union types](https://zod.dev/api?id=unions)

In this example, we'll define a set of possible predictions we want the LLM to generate based on the previous action the user has taken.

```ts
const PREDICTIONS_SCHEMA = s.anyOf([
  s.object('Suggests adding a light to the system', {
    type: s.literal('Add Light'),
    name: s.string('The suggested name of the light'),
    brightness: s.integer('A number between 0-100'),
  }),
  s.object('Suggest adding a scene to the system', {
    type: s.literal('Add Scene'),
    name: s.string('The suggested name of the scene'),
    lights: s.array(
      'The lights in the scene',
      s.object('A light in the scene', {
        lightId: s.string('The ID of the light'),
        brightness: s.integer('A number between 0-100'),
      }),
    ),
  }),
  s.object('Suggest scheduling a scene to the system', {
    type: s.literal('Schedule Scene'),
    sceneId: s.string('The ID of the scene'),
    datetime: s.string('The datetime of the scene'),
  }),
  s.object('Suggest adding a light to a scene', {
    type: s.literal('Add Light to Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    brightness: s.integer('A number between 0-100'),
  }),
  s.object('Suggest removing a light from a scene', {
    type: s.literal('Remove Light from Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
  }),
]);
```

- The `anyOf` function defines a set of possible schemas that the LLM can return.
- The `type` discriminates the type of prediction.
- We use `s.literal` to define a literal value for each type.
- The `s.literal() function accepts a `boolean`, `number`, or `string` value that the LLM must return.

---

## Numeric Types

Skillet supports numeric types using either the `number()` or `integer()` function.
The `number()` function allows for floating-point numbers, while the `integer()` function restricts the value to integers.

Note, Skillet currently does not support `minimum` or `maximum` values for numeric types due to the current limitations of LLMs

---

## Streaming

We saved the best bite for last.
Skillet supports streaming responses out of the box.

To enable streaming, simply add the `streaming` keyword to your schema.

```ts
s.streaming.array(
  'The lights to add to the scene',
  s.object('A join between a light and a scene', {
    lightId: s.string('the ID of the light to add'),
    brightness: s.number('the brightness of the light from 0 to 100'),
  }),
);
```

Skillet eagerly parses fragments of the streamed response from the LLM.
