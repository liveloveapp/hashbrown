# Structured Output

<p class="subtitle">Specify the JSON schema of the model response.</p>

- Structured output can replace forms with natural language input via text or audio.
- Users can navigate via chat.
- Provide structured predictive actions given application state and user events.
- Allow the user to customer the entire application user interface.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## The `structuredChatResource()` Function

<hb-code-example header="get a structured response">

```ts
@Component({})
export class App {
  // 1. Create the resource with the specified `schema`
  chat = structuredChatResource({
    system: `Collect the user's first and last name.`,
    schema: s.object('The user', {
      firstName: s.string('First name'),
      lastName: s.string('Last name'),
    }),
  });

  constructor() {
    // 1. Send a user message
    chat.sendMessage({ role: 'user', content: 'My name is Brian Love' });

    // 3. Log out the structure response
    effect(() => {
      const value = chat.value();
      console.log({
        firstName: value.content.firstName,
        lastName: value.content.lastName,
      });
    });
  }
}
```

</hb-code-example>

1. The @hashbrownai/angular!structuredChatResource:function function is used to create a chat resource that can parse user input and return structured data.
2. The `schema` option defines the expected structure of the response using Hashbrown's Skillet schema language.
3. The resource `value()` contains the structured output, which can be used directly in your application.

Here is the expected `content` value:

```json
{
  "firstName": "Brian",
  "lastName": "Love"
}
```

---

### `StructuredChatResourceOptions`

| Option      | Type                                     | Required | Description                                               |
| ----------- | ---------------------------------------- | -------- | --------------------------------------------------------- |
| `model`     | `KnownModelIds \| Signal<KnownModelIds>` | Yes      | The model to use for the structured chat resource         |
| `system`    | `string \| Signal<string>`               | Yes      | The system prompt to use for the structured chat resource |
| `schema`    | `Schema`                                 | Yes      | The schema to use for the structured chat resource        |
| `tools`     | `Tools[]`                                | No       | The tools to use for the structured chat resource         |
| `messages`  | `Chat.Message<Output, Tools>[]`          | No       | The initial messages for the structured chat resource     |
| `debugName` | `string`                                 | No       | The debug name for the structured chat resource           |
| `debounce`  | `number`                                 | No       | The debounce time for the structured chat resource        |
| `retries`   | `number`                                 | No       | The number of retries for the structured chat resource    |
| `apiUrl`    | `string`                                 | No       | The API URL to use for the structured chat resource       |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/structuredChatResource">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>structuredChatResource() API</h4>
      <p>See the resource documentation</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/angular/StructuredChatResourceOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>StructuredChatResourceOptions API</h4>
      <p>See all of the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## The `structuredCompletionResource()` Function

The @hashbrownai/angular!structuredCompletionResource:function function builds on top of the @hashbrownai/angular!structuredChatResource:function function by providing an additional `input` option.

<hb-code-example header="get a structured response from a bound input">

```ts
predictedLights = structuredCompletionResource({
  debugName: 'Predict Lights',
  system: `
    You are an assistant that helps the user configure a lighting scene.
    The user will choose a name for the scene, and you will predict the
    lights that should be added to the scene based on the name. The input
    will be the scene name and the list of lights that are available.

    # Rules
    - Only suggest lights from the provided "availableLights" input list.
    - Pick a brightness level for each light that is appropriate for the scene.
  `,
  input: computed(() => {
    if (!this.sceneNameSignal()) return null;

    return {
      input: this.sceneNameSignal(),
      availableLights: untracked(() => {
        return this.lights().map((light) => ({
          id: light.id,
          name: light.name,
        }));
      }),
    };
  }),
  schema: s.array(
    'The lights to add to the scene',
    s.object('A join between a light and a scene', {
      lightId: s.string('the ID of the light to add'),
      brightness: s.number('the brightness of the light from 0 to 100'),
    }),
  ),
});
```

</hb-code-example>

Let's review the code above.

1. The @hashbrownai/angular!structuredCompletionResource:function function is used to create a resource that predicts lights based on the scene name.
2. The `input` option is set to a signal that contains the scene name and additional untracked context. This signal updates each time the scene name signal changes, and reads the list of light names and sends them along.
3. The `schema` defines the expected structure of the response, which includes an array of lights with their IDs and brightness levels.

When the user types a scene name, the LLM will predict which lights should be added to the scene and return a structured JSON object that can be used directly in your application.

---

### `StructuredCompletionResourceOptions`

| Option      | Type                                 | Required | Description                                                     |
| ----------- | ------------------------------------ | -------- | --------------------------------------------------------------- |
| `model`     | `KnownModelIds`                      | Yes      | The model to use for the structured completion resource         |
| `input`     | `Signal<null \| undefined \| Input>` | Yes      | The input to the structured completion resource                 |
| `schema`    | `Schema`                             | Yes      | The schema to use for the structured completion resource        |
| `system`    | `SignalLike<string>`                 | Yes      | The system prompt to use for the structured completion resource |
| `tools`     | `Chat.AnyTool[]`                     | No       | The tools to use for the structured completion resource         |
| `debugName` | `string`                             | No       | The debug name for the structured completion resource           |
| `apiUrl`    | `string`                             | No       | The API URL to use for the structured completion resource       |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/angular/structuredCompletionResource">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>structuredCompletionResource() API</h4>
      <p>See the full resource</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/angular/StructuredCompletionResourceOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>StructuredCompletionResourceOptions API</h4>
      <p>See the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Global Predictions

In this example, we'll assume you are using a global state container (like NgRx).
We'll send each action to the LLM and ask it to predict the next possible action a user should consider.

<hb-code-example header="predictions.ts">

```ts
lastAction = this.store.selectSignal(selectLastUserAction);

predictions = structuredCompletionResource({
  // 1. The resource is re-computed with the last user action
  input: this.lastAction,

  // 2. The system instructions provide the guidelines and rules
  system: `
    You are an AI smart home assistant tasked with predicting the next possible user action in a 
    smart home configuration app. Your suggestions will be displayed as floating cards in the 
    bottom right of the screen.

    Important Guidelines:
    - The user already owns all necessary hardware. Do not suggest purchasing hardware.
    - Every prediction must include a concise 'reasonForSuggestion' that explains the suggestion 
      in one sentence.
    - Each prediction must be fully detailed with all required fields based on its type.

    Additional Rules:
    - Always check the current lights and scenes states to avoid suggesting duplicates.
    - If a new light has just been added, consider suggesting complementary lights or adding it 
      to an existing scene.
    - You do not always need to make a prediction. Returning an empty array is also a valid 
      response.
    - You may make multiple predictions. Just add multiple predictions to the array.
  `,

  // 3. Provide tools to retrieve the current app state
  tools: [
    createTool({
      name: 'getLights',
      description: 'Get all lights in the smart home',
      handler: () => this.smartHomeService.loadLights(),
    }),
    createTool({
      name: 'getScenes',
      description: 'Get all scenes in the smart home',
      handler: () => this.smartHomeService.loadScenes(),
    }),
  ],

  // 4. Specify the structured output schema
  schema: s.object('The result', {
    predictions: s.streaming.array(
      'The predictions',
      s.anyOf([
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
      ]),
    ),
  }),
});
```

</hb-code-example>

Let's review the code above:

1. The @hashbrownai/angular!structuredCompletionResource:function function is used to create a resource that predicts the next possible user action based on the last action.
2. The `input` option is set to a signal that contains the last user action, allowing the resource to reactively update when the last action changes.
3. The `system` option provides context to the LLM, instructing it to predict the next possible user action in the app.
4. The `tools` option defines two tools that the LLM can use to get the current state of lights and scenes in the smart home.
5. The `schema` defines the expected structure of the response, which includes an array of predictions with their types and details.

When the user performs an action, the LLM will predict the next possible actions and return a structured JSON object.
From there, you can wire up a toast notification to be displayed when the LLM provides a prediction.
When the user accepts the predictive action, dispatch the action and update the state of the app accordingly.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose Angular components to the LLM for generative UI.</p>
    </div>
  </hb-next-step>
  <hb-next-step link="concept/runtime">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>Execute LLM-generated JS in the browser (safely)</h4>
      <p>Use Hashbrown's JavaScript runtime for complex and mathematical operations.</p>
    </div>
  </hb-next-step>
</hb-next-steps>
