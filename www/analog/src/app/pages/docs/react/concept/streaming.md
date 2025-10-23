---
title: 'Streaming: Hashbrown React Docs'
meta:
  - name: description
    content: 'Applications leveraging LLMs offer the best user experience by leveraging streaming to show responses to the user as fast as the LLM can generate them. By leveraging streaming, you can improve perceived performance of your application.'
---
# Streaming

Applications leveraging LLMs offer the best user experience by leveraging streaming to show responses to the user as fast as the LLM can generate them. By leveraging streaming, you can improve perceived performance of your application. Hashbrown is architected to make streaming as easy and simple to consume for you, the developer, as possible.

---

## What is Skillet?

Skillet is a Zod-like schema language that is LLM-optimized.

- Skillet is strongly typed
- Skillet has feature parity with schemas supported by LLM providers
- Skillet optimizes the schema for processing by an LLM
- Skillet tightly integrates streaming

[Read our docs on the Skillet schema language](/docs/react/concept/schema)

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## Streaming Responses

Let's look at a structured completion hook in React:

<hb-code-example header="streaming">

```tsx
import { useStructuredCompletion } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const schema = s.object('Your response', {
  lights: s.streaming.array(
    'The lights to add to the scene',
    s.object('A join between a light and a scene', {
      lightId: s.string('the ID of the light to add'),
      brightness: s.number('the brightness of the light from 0 to 100'),
    }),
  ),
});

function usePredictedLights(
  sceneName: string,
  lights: { id: string; name: string }[],
) {
  const input = useMemo(() => {
    return { sceneName, lights };
  }, [sceneName, lights]);
  return useStructuredCompletion({
    model: 'gpt-4.1',
    input,
    system: `
      Predict the lights that will be added to the scene based on the name. For example,
      if the scene name is "Dim Bedroom Lights", suggest adding any lights that might
      be in the bedroom at a lower brightness.
    `,
    schema,
  });
}
```

</hb-code-example>

- In this example, focus on the `schema` specified.
- The `s.streaming.array` is a Skillet schema that indicates the response will be a streaming array.
- The `s.object` inside the array indicates that each item in the array will be an object with the specified properties.
- Note that the `streaming` keyword is _not_ specified for each light object in the array. This is because our React application requires both the `lightId` and the `brightness` properties.

Skillet will eagerly parse the chunks streamed to the `output` value returned by the `useStructuredCompletion` hook.
Combining this with React's reactivity, streaming UI to your frontend is a one-line code change with Hashbrown.

---

## Implementating Streaming Responses

<hb-code-example header="streaming">

```ts
export const App = () => {
  const [sceneName] = useState<string>('');
  const [lights] = useState<Light[]>([]);
  const { output, isSending } = usePredictedLights(sceneName, lights);

  return (
    {output?.lights?.map((prediction) => (
      <SceneLightRecommendation
        key={prediction.lightId}
        lightId={prediction.lightId}
        brightness={prediction.brightness}
      />
    ))}
  );
}
```

</hb-code-example>

1. In this example, we call the `usePredictedLights` hook.
2. We then map over the `output.lights` array to render a `SceneLightRecommendation` component for each predicted light.
3. As the LLM streams in new lights, the `output.lights` array will be updated, and the UI will re-render to show the new lights.

There's no magic here - as the LLM streams the response, the `output` value is updated, and React takes care of the rest.
