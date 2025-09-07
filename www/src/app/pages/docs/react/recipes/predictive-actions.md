# Building Predictive Suggestions and Shortcuts Using React

<p class="subtitle">Use Hashbrown structured outputs to suggest a user's next action in your app.</p>

1. Define a schema of predictive actions including reasons and confidence scores.
2. Provide tools the model can call to read the current app state.
3. Use the @hashbrownai/react!useStructuredCompletion:function hook to stream an array of suggestions.
4. Render suggestions with React.
5. Allow users to accept or dismiss suggestions.

---

## How it Works

1. Define a schema describing the structure of predictive actions, including metadata like reason and confidence.
2. Provide tool functions that the model can call to fetch current app state (e.g., lights, scenes).
3. Use the @hashbrownai/react!useStructuredCompletion:function hook to stream predictions from the model.
4. Render the streamed predictions in your UI with clear affordances to accept or dismiss.
5. When a user accepts a prediction, dispatch corresponding domain actions, tagging them as AI-originated for traceability.

---

## Before You Start

**Prerequisites:**

- Familiarity with React, modern hooks, and TypeScript
- React 18 or higher
- A working Hashbrown setup (see Hashbrown Quick Start)
- Install dependencies:

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/react @hashbrownai/core @hashbrownai/openai
```

</hb-code-example>

We'll use `gpt-5` as our model and the OpenAI Hashbrown adapter, but you can use any supported provider.

---

## 1: Define a Prediction Schema

Define the response format schema using Skillet.

<hb-code-example header="Prediction schema">

```ts
import { s } from '@hashbrownai/core';

export const PREDICTIONS_SCHEMA = s.anyOf([
  s.object('Suggest adding a light to the system', {
    type: s.literal('Add Light'),
    name: s.string('The suggested name of the light'),
    brightness: s.integer('A number between 0-100'),
    reason: s.string('Why this suggestion was made'),
    confidence: s.number('Confidence score between 0 and 1'),
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
    reason: s.string('Why this suggestion was made'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest scheduling a scene to the system', {
    type: s.literal('Schedule Scene'),
    sceneId: s.string('The ID of the scene'),
    datetime: s.string('The datetime of the scene in ISO format'),
    reason: s.string('Why this suggestion was made'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest adding a light to a scene', {
    type: s.literal('Add Light to Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    brightness: s.integer('A number between 0-100'),
    reason: s.string('Why this suggestion was made'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest removing a light from a scene', {
    type: s.literal('Remove Light from Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    reason: s.string('Why this suggestion was made'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
]);
```

</hb-code-example>

This schema will be used to validate and structure the model's output.

---

## 2: Create a Streaming Predictions Hook

Use the @hashbrownai/react!useStructuredCompletion:function hook from `@hashbrownai/react` to stream predictions as the model generates them.

<hb-code-example header="predictions">

```tsx
import { s } from '@hashbrownai/core';
import { useStructuredCompletion, useTool } from '@hashbrownai/react';

type Prediction = s.Infer<typeof PREDICTIONS_SCHEMA>;

export function usePredictions() {
  const smartHome = useSmartHome();
  const lastAction = useLastUserAction();
  
  const getLights = useTool({
    name: 'getLights',
    description: 'Get all lights in the smart home',
    handler: async (_abort) => await smartHome.loadLights(),
    deps: [smartHome],
  });
  
  const getScenes = useTool({
    name: 'getScenes',
    description: 'Get all scenes in the smart home',
    handler: async (_abort) => await smartHome.loadScenes(),
    deps: [smartHome],
  });
  
  const { output } = useStructuredCompletion({
    model: 'gpt-5',

    // 1. Recompute whenever `input` changes
    input: lastAction,

    // 2. Provide clear instructions, rules, and examples in the system prompt
    system: `
      You are an AI smart home assistant tasked with predicting the next possible user action.

      ## Instructions
      - Include a concise 'reason' explaining why the suggestion was made.
      - Provide a 'confidence' score between 0 and 1.
      - Avoid duplicates; check current lights and scenes before suggesting.
      - Returning an empty array is valid if no suggestions apply.
      - Multiple predictions can be returned.

      ## Examples
      [
        {
          "type": "Add Light",
          "name": "Living Room Lamp",
          "brightness": 75,
          "reason": "User recently turned on the living room lights frequently in the evening.",
          "confidence": 0.85
        },
        {
          "type": "Add Scene",
          "name": "Movie Night",
          "lights": [
            { "lightId": "light1", "brightness": 30 },
            { "lightId": "light2", "brightness": 20 }
          ],
          "reason": "User often dims lights around 8pm for watching movies.",
          "confidence": 0.78
        }
      ]
    `,

    // 3. Provide the model with context of the application state using tool calling
    tools: [getLights, getScenes],

    // 4. Specify the structured output response format
    schema: s.object('The result', {
      predictions: s.streaming.array('The predictions', PREDICTIONS_SCHEMA),
    }),
  });

  // 5. Derive a simple array for rendering and local manipulation
  const predictions = useMemo<Prediction[]>(
    () => output?.predictions ?? [],
    [output],
  );

  // Optional: keep a local, user-dismissible copy for UI interactions
  const [visiblePredictions, setVisiblePredictions] =
    useState<Prediction[]>(predictions);
  useEffect(() => setVisiblePredictions(predictions), [predictions]);

  return { visiblePredictions, setVisiblePredictions };
}
```

</hb-code-example>

1. First, we specify the `input` as the last user action to trigger new predictions.
2. The system prompt provides clear instructions, rules, and examples to guide the model's output.
4. We provide tools `getLights` and `getScenes` that the model can call to fetch current app state.
5. The `schema` parameter ensures the model's output adheres to our defined structure.

---

## 3: Show the Suggestions

Display the suggestion cards as an overlay to the user.
The user can then choose to accept or dismiss the suggestion.

<hb-code-example header="overlay suggestions">

```tsx
import React from 'react';
import { usePredictions } from './use-predictions';

export function PredictionsOverlay() {
  const { visiblePredictions, setVisiblePredictions } = usePredictions();

  const removePrediction = (index: number) => {
    setVisiblePredictions((prev) => prev.filter((_, i) => i !== index));
  };

  const acceptAddLight = (
    index: number,
    light: { name: string; brightness: number },
  ) => {
    // Replace with your state management (Redux, Zustand, Context, etc.)
    // dispatch({ type: 'predictions/addLight', payload: { light, aiOrigin: true } });
    removePrediction(index);
  };

  return (
    <div className="predictions-overlay">
      {visiblePredictions.map((prediction, index) => {
        const { reason, confidence } = prediction;
        switch (prediction.type) {
          case 'Add Light':
            return (
              <div className="prediction-card" key={index}>
                <p>
                  <strong>Add Light:</strong> "{prediction.name}" with
                  brightness {prediction.brightness}
                </p>
                <p>
                  <em>Reason:</em> {reason}
                </p>
                <p>
                  <em>Confidence:</em> {(confidence * 100).toFixed(1)}%
                </p>
                <div className="prediction-actions">
                  <button onClick={() => removePrediction(index)}>
                    Dismiss
                  </button>
                  <button
                    onClick={() =>
                      acceptAddLight(index, {
                        name: prediction.name,
                        brightness: prediction.brightness,
                      })
                    }
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          case 'Add Scene':
            return (
              <div className="prediction-card" key={index}>
                <p>
                  <strong>Add Scene:</strong> "{prediction.name}" with{' '}
                  {prediction.lights.length} lights
                </p>
                <p>
                  <em>Reason:</em> {reason}
                </p>
                <p>
                  <em>Confidence:</em> {(confidence * 100).toFixed(1)}%
                </p>
                <div className="prediction-actions">
                  <button onClick={() => removePrediction(index)}>
                    Dismiss
                  </button>
                  <button
                    onClick={() => {
                      // Implement acceptAddScene similarly
                    }}
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          // Add other cases as needed...
          default:
            return null;
        }
      })}
    </div>
  );
}
```

</hb-code-example>

1. First, we map over `visiblePredictions` to render each suggestion.
2. Each card displays the prediction details, reason, and confidence.
3. Buttons allow users to dismiss or accept suggestions.

---

## 4: Optional Redux Toolkit Integration

If using Redux Toolkit, you can define slices and actions for managing predictions and tagging AI-originated events.

<hb-code-example header="Redux slice example">

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Light {
  name: string;
  brightness: number;
}

interface PredictionsState {
  lights: Light[];
  // other state as needed
}

const initialState: PredictionsState = {
  lights: [],
};

const predictionsSlice = createSlice({
  name: 'predictions',
  initialState,
  reducers: {
    addLight: (
      state,
      action: PayloadAction<{ light: Light; aiOrigin: boolean }>,
    ) => {
      // Optionally track aiOrigin for audit/logging
      state.lights.push(action.payload.light);
    },
    // other reducers...
  },
});

export const { addLight } = predictionsSlice.actions;
export default predictionsSlice.reducer;
```

</hb-code-example>

---

## Guardrails & UX Patterns

- **Confidence Threshold:** Only show suggestions with a confidence score above a certain threshold (e.g., 0.7).
- **Duplicate Prevention:** Use the model's instructions and your own logic to avoid suggesting actions that duplicate existing state.
- **User Control:** Always allow users to dismiss suggestions easily.
- **Explainability:** Provide reasons for suggestions to build trust.
- **Rate Limiting:** Limit how often suggestions appear to avoid overwhelming users.
- **Fallbacks:** Handle empty or invalid predictions gracefully.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/structured-output">
    <div>
      <hb-database-cog />
    </div>
    <div>
      <h4>Get structured data from models</h4>
      <p>Use Skillet schema to describe model responses.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/functions">
    <div>
      <hb-functions />
    </div>
    <div>
      <h4>Tool Calling</h4>
      <p>Provide callback functions to the LLM.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
