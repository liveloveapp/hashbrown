# Streaming

We believe that streaming is both paramount to implementing AI generative technologies into web application and there should be minimal barriers to implementing streaming.

How do we make this a reality?

- First, we built an LLM-optimized schema language called Skillet.
- Skillet has both streaming and partial parsing built into the core.
- We make it easy - simply add the `streaming` keyword to your schema.

---

## What is Skillet?

I don't know about you - but we love hot, crispy, and fresh hashbrowns.
Skillet is a Zod-like schema language that is LLM-optimized.
What does that mean?

- Skillet purposefully limits the schema to that which is supported by LLMs
- Skillet tightly integrates streaming

[Read our docs on the Skillet schema language](/docs/angular/concept/schema)

---

## Streaming Responses

First, let's look at a structured completion resource:

<www-code-example header="scene-form-dialog.component.ts">

```ts
predictedLights = structuredCompletionResource({
  model: 'gpt-4.1',
  input: this.sceneNameSignal,
  system: computed(
    () => `
    Predict the lights that will be added to the scene based on the name. For example,
    if the scene name is "Dim Bedroom Lights", suggest adding any lights that might
    be in the bedroom at a lower brightness.

    Here's the list of lights:
    ${this.lights()
      .map((light) => `${light.id}: ${light.name}`)
      .join('\n')}
  `,
  ),
  debugName: 'Predict Lights',
  schema: s.object('Your response', {
    lights: s.streaming.array(
      'The lights to add to the scene',
      s.object('A join between a light and a scene', {
        lightId: s.string('the ID of the light to add'),
        brightness: s.number('the brightness of the light from 0 to 100'),
      }),
    ),
  }),
});
```

</www-code-example>

- In this example, let's focus on the `schema` specified.
- The `s.streaming.array` is a Skillet schema that indicates that the response will be a streaming array.
- The `s.object` inside the array indicates that each item in the array will be an object with the specified properties.
- Note that the `streaming` keyword is _not_ specified for each light object in the array. This is because our Angular application requires both the `lightId` and the `brightness` properties.

Here's where it get's good.
Skillet will eagerly parse the chunks streamed to the resource `value()` signal.
Combining this with Angular's reactivity, streaming UI to your frontend is a one-line code change with hashbrown.
