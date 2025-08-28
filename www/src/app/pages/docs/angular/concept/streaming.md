# Streaming

<p class="subtitle">Drop-in streaming support for eagerly parsing JSON</p>

- First, we built an LLM-optimized schema language called Skillet
- Skillet has both streaming and partial parsing built into the core
- We make it easy - simply add the `streaming` keyword to your schema

---

## What is Skillet?

Skillet is a Zod-like schema language that is LLM-optimized.

- Skillet is strongly typed
- Skillet purposefully limits the schema to that which is supported by LLMs
- Skillet optimizes the schema for processing by an LLM
- Skillet tightly integrates streaming

[Read our docs on the Skillet schema language](/docs/angular/concept/schema)

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## Streaming Responses

Let's look at a structured completion resource:

<hb-code-example header="scene-form-dialog.component.ts">

```ts
predictedLights = structuredCompletionResource({
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

</hb-code-example>

- In this example, let's focus on the `schema` specified.
- The `s.streaming.array` is a Skillet schema that indicates that the response will be a streaming array.
- The `s.object` inside the array indicates that each item in the array will be an object with the specified properties.
- Note that the `streaming` keyword is _not_ specified for each light object in the array. This is because our Angular application requires both the `lightId` and the `brightness` properties.

Skillet will eagerly parse the chunks streamed to the resource `value()` signal.
Combining this with Angular's reactivity, streaming UI to your frontend is a one-line code change with Hashbrown.

---

## Implementing Streaming Responses

<hb-code-example header="streaming">

```ts
@Component({
  template: `
    @for (
      prediction of predictedLights.value()?.lights ?? [];
      track prediction.lightId
    ) {
      <app-scene-light-recommendation
        [lightId]="prediction.lightId"
        [brightness]="prediction.brightness"
      />
    }
  `,
})
export class App {}
```

</hb-code-example>

1. In this example, we previously created the `predictedLights` resource.
2. We then iterate over `predictedLights.value()?.lights` to render a `app-scene-light-recommendation` for each predicted light.
3. As the LLM streams in new lights, the `value()` signal updates, and the UI re-renders to show the new lights.

There's no magic here - as the LLM streams the response, the `value()` signal is updated, and Angular takes care of the rest.
