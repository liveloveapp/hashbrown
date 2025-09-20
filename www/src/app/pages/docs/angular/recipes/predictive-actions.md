---
title: 'Building Predictive Suggestions and Shortcuts Using Angular: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Use Hashbrown structured outputs to suggest a user''s next action in your app.'
---
# Building Predictive Suggestions and Shortcuts Using Angular

<p class="subtitle">Use Hashbrown structured outputs to suggest a user's next action in your app.</p>

1. Predict likely next steps based on recent user actions and current app state
2. Stream suggestions as they are generated
3. Allow users to accept or dismiss

---

## How it Works

1. Define a schema of predictive actions.
2. Provide tools the model can call to read the current app state.
3. Create a @hashbrownai/angular!structuredCompletionResource:function that streams an array of suggestions.
4. Render suggestions with Angular's native control flow.
5. If the user accepts the suggestion then dispatch the corresponding action.

---

## Before you start

**Prerequisites:**

- Familiarity with Angular and modern component syntax (signals, standalone components)
- Angular 20 or higher, with [standalone components and the Resources API](https://angular.dev)
- A working Hashbrown setup ([Hashbrown Quick Start](/docs/angular/start/quick))
- Install dependencies:

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/angular @hashbrownai/core @hashbrownai/openai ngx-markdown
```

</hb-code-example>

We'll use `gpt-5` as our model and the OpenAI Hashbrown adapter, but you can use any supported provider.

---

## 1: Define a Prediction Schema

Define the response format schema using Skillet.

<hb-code-example header="schema">

```ts
import { s } from '@hashbrownai/core';

export const PREDICTIONS_SCHEMA = s.anyOf([
  s.object('Suggest adding a light to the system', {
    type: s.literal('Add Light'),
    name: s.string('The suggested name of the light'),
    brightness: s.integer('A number between 0-100'),
    reason: s.string('Reason for suggestion'),
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
    reason: s.string('Reason for suggestion'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest scheduling a scene to the system', {
    type: s.literal('Schedule Scene'),
    sceneId: s.string('The ID of the scene'),
    datetime: s.string('The datetime of the scene'),
    reason: s.string('Reason for suggestion'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest adding a light to a scene', {
    type: s.literal('Add Light to Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    brightness: s.integer('A number between 0-100'),
    reason: s.string('Reason for suggestion'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
  s.object('Suggest removing a light from a scene', {
    type: s.literal('Remove Light from Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    reason: s.string('Reason for suggestion'),
    confidence: s.number('Confidence score between 0 and 1'),
  }),
]);
```

</hb-code-example>

This schema will be used to validate and structure the model's output.

---

## 2: Create a Streaming Predictions Resource

Create a new resource using the @hashbrownai/angular!structuredCompletionResource:function function to stream an array of predictions.

<hb-code-example header="predictions">

```ts
import { s } from '@hashbrownai/core';
import { structuredCompletionResource, createTool } from '@hashbrownai/angular';

@Component({
  selector: 'app-predictions',
  standalone: true,
})
export class PredictionsComponent {
  private store = inject(Store);
  private smartHome = inject(SmartHomeService);

  // 1. Define a signal whose value is the last user action
  lastAction = this.store.selectSignal(selectLastUserAction);

  // 2. Create the predictions resource
  predictions = structuredCompletionResource({
    model: 'gpt-5',

    // 3. The predictions resource will re-compute when the `input` signal value is updated
    input: this.lastAction,

    // 4. Provide clear instructions, rules, and examples in the system prompt
    system: `
      You are an AI smart home assistant tasked with predicting the next possible user action.

      ## Instructions
      - Include a concise reason for each suggestion.
      - Provide a confidence score between 0 and 1.
      - Avoid duplicates; check current lights and scenes before offering suggestions.
      - Returning an empty array is valid.
      - You may return multiple predictions.

      ## Examples
      - Provide a few examples
    `,

    // 5. Provide the model with context of the application state using tool calling
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get all lights in the smart home',
        handler: async () => await this.smartHome.loadLights(),
      }),
      createTool({
        name: 'getScenes',
        description: 'Get all scenes in the smart home',
        handler: async () => await this.smartHome.loadScenes(),
      }),
    ],

    // 6. Specify the structured output response format
    schema: s.object('The result', {
      predictions: s.streaming.array('The predictions', PREDICTIONS_SCHEMA),
    }),
  });

  // 7. Derive a simple array from the resource value
  output = linkedSignal({
    source: this.predictions.value,
    computation: (source): s.Infer<typeof PREDICTIONS_SCHEMA>[] =>
      source?.predictions ?? [],
  });

  removePrediction(index: number) {
    this.output.update((predictions) => {
      predictions.splice(index, 1);
      return [...predictions];
    });
  }

  addLight(index: number, light: { name: string; brightness: number }) {
    this.removePrediction(index);
    this.store.dispatch(PredictionsAiActions.addLight({ light }));
  }

  addScene(index: number, scene: { name: string; lights: any[] }) {
    this.removePrediction(index);
    this.store.dispatch(PredictionsAiActions.addScene({ scene }));
  }
}
```

</hb-code-example>

In this example:

1. We define a signal `lastAction` that represents the most recent user action.
2. We create a @hashbrownai/angular!structuredCompletionResource:function named `predictions` that uses the `gpt-5` model.
3. The resource re-computes whenever the `input` signal value is updated.
4. We provide a detailed system prompt with instructions and examples to guide the model.
5. We include tools (`getLights` and `getScenes`) with async handlers to give the model context about the current state of the smart home.
6. We specify the output schema using the previously defined `PREDICTIONS_SCHEMA`, allowing for streaming arrays of predictions.
7. Finally, we derive a simple array `output` from the resource value for easy rendering in the UI.
8. We also define methods for removing and accepting predictions.

---

## 3: Show the Suggestions

Display the suggestion cards as an overlay to the user.
The user can then choose to accept or dismiss the suggestion.

<hb-code-example header="overlay suggestions">

```ts
@Component({
  standalone: true,
  template: `
    @for (prediction of output(); track $index) {
      <div class="prediction">
        <p>
          <strong>Suggestion:</strong> {{ prediction.type }} -
          <em>{{ prediction.reason }}</em> (Confidence:
          {{ prediction.confidence * 100 | number: '1.0-0' }}%)
        </p>
        @switch (prediction.type) {
          @case ('Add Light') {
            <p>
              Add Light "{{ prediction.name }}" with brightness
              {{ prediction.brightness }}
            </p>
            <div>
              <button (click)="removePrediction($index)">Dismiss</button>
              <button
                (click)="
                  addLight($index, {
                    name: prediction.name,
                    brightness: prediction.brightness,
                  })
                "
              >
                Accept
              </button>
            </div>
          }
          @case ('Add Scene') {
            <p>
              Add Scene "{{ prediction.name }}" with
              {{ prediction.lights.length }} lights
            </p>
            <div>
              <button (click)="removePrediction($index)">Dismiss</button>
              <button
                (click)="
                  addScene($index, {
                    name: prediction.name,
                    lights: prediction.lights,
                  })
                "
              >
                Accept
              </button>
            </div>
          }
          @default {
            <div>
              <button (click)="removePrediction($index)">Dismiss</button>
            </div>
          }
        }
      </div>
    }
  `,
})
export class PredictionsComponent {}
```

</hb-code-example>

In this example:

1. We use Angular's native control flow syntax to iterate over the `output` array of predictions.
2. For each prediction, we display the type, reason, and confidence.
3. We use a switch statement to render different UI elements based on the prediction type.
4. Each prediction card includes "Dismiss" and "Accept" buttons, allowing users to interact with the suggestions.

---

## 4: Guardrails & UX Patterns

To ensure a good user experience and prevent unwanted actions:

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
