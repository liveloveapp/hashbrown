---
title: 'Structured Output: Hashbrown React Docs'
meta:
  - name: description
    content: 'Specify the JSON schema of the model response.'
---
# Structured Output

<p class="subtitle">Specify the JSON schema of the model response.</p>

- Structured output can replace forms with natural language input via text or audio.
- Users can navigate via chat.
- Provide structured predictive actions given application state and user events.
- Allow the user to customize the entire application user interface.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## The `useStructuredChat()` Hook

<hb-code-example header="get a structured response">

```tsx
import { useStructuredChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { useEffect } from 'react';

function App() {
  // 1. Create the hook instance with the specified `schema`
  const chat = useStructuredChat({
    system: `Collect the user's first and last name.`,
    schema: s.object('The user', {
      firstName: s.string('First name'),
      lastName: s.string('Last name'),
    }),
  });

  useEffect(() => {
    // 2. Send a user message
    chat.sendMessage({ role: 'user', content: 'My name is Brian Love' });

    // 3. Log out the structured response
    if (chat.lastAssistantMessage?.content) {
      const value = chat.lastAssistantMessage.content;
      console.log({
        firstName: value.firstName,
        lastName: value.lastName,
      });
    }
  }, [chat]);

  return null;
}
```

</hb-code-example>

1. The @hashbrownai/react!useStructuredChat:function hook is used to create a chat instance that can parse user input and return structured data.
2. The `schema` option defines the expected structure of the response using Skillet (or a Standard JSON Schema object that Hashbrown normalizes to Skillet).
3. The assistant message `content` contains the structured output, which can be used directly in your application.

Here is the expected `content` value:

```json
{
  "firstName": "Brian",
  "lastName": "Love"
}
```

---

### Schema Inputs

The `schema` option accepts Skillet schemas, Standard JSON Schema objects (the `~standard` spec, e.g. Zod/ArkType), or raw JSON Schema objects. Standard JSON Schema inputs are normalized to Skillet (draft-07) before streaming and validation. Unsupported keywords throw at runtime.

---

### `UseStructuredChatOptions`

| Option         | Type                            | Required | Description                                         |
| -------------- | ------------------------------- | -------- | --------------------------------------------------- |
| `model`        | `KnownModelIds`                 | Yes      | The model to use for the structured chat            |
| `system`       | `string`                        | Yes      | The system prompt to use for the structured chat    |
| `schema`       | `s.SchemaOutput`                | Yes      | The schema to use for the structured chat           |
| `tools`        | `Tools[]`                       | No       | The tools to make available for the structured chat |
| `messages`     | `Chat.Message<Output, Tools>[]` | No       | The initial messages for the structured chat        |
| `debugName`    | `string`                        | No       | The debug name for the structured chat              |
| `debounceTime` | `number`                        | No       | The debounce time between sends to the endpoint     |
| `retries`      | `number`                        | No       | The number of retries if an error is received       |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/react/useStructuredChat">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>useStructuredChat() API</h4>
      <p>See the hook documentation</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/react/UseStructuredChatOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UseStructuredChatOptions API</h4>
      <p>See all of the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## The `useStructuredCompletion()` Hook

The @hashbrownai/react!useStructuredCompletion:function hook builds on top of the @hashbrownai/react!useStructuredChat:function hook by providing an additional `input` option.

<hb-code-example header="get a structured response from a bound input">

```tsx
import { useStructuredCompletion } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { useMemo } from 'react';

function SceneFormDialog({ sceneName, lights }) {
  // 1. Compute memoized input to the model
  const input = useMemo(() => {
    if (!sceneName) return null;
    return {
      input: sceneName,
      availableLights: lights.map((light) => ({
        id: light.id,
        name: light.name,
      })),
    };
  }, [sceneName, lights]);

  // 2. Fetch the structured `output` matching the required `schema` from the model from the provided `input`
  const { output } = useStructuredCompletion({
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
    input,
    schema: s.array(
      'The lights to add to the scene',
      s.object('A join between a light and a scene', {
        lightId: s.string('the ID of the light to add'),
        brightness: s.number('the brightness of the light from 0 to 100'),
      }),
    ),
  });

  // 3. Render the UI using the `output` matching the `schema`
}
```

</hb-code-example>

Let's review the code above.

1. The @hashbrownai/react!useStructuredCompletion:function hook is used to create a resource that predicts lights based on the scene name.
2. The `input` option is set to a memoized value that contains the scene name and additional context. This value updates each time the scene name or lights change, and sends them along.
3. The `system` option provides context to the LLM, instructing it to predict lights based on the scene name.
4. The `schema` defines the expected structure of the response, which includes an array of lights with their IDs and brightness levels.

---

### `UseStructuredCompletionOptions`

| Option         | Type                         | Required | Description                                               |
| -------------- | ---------------------------- | -------- | --------------------------------------------------------- |
| `model`        | `KnownModelIds`              | Yes      | The model to use for the structured completion            |
| `input`        | `Input \| null \| undefined` | Yes      | The input to the structured completion                    |
| `schema`       | `s.SchemaOutput`             | Yes      | The schema to use for the structured completion           |
| `system`       | `string`                     | Yes      | The system prompt to use for the structured completion    |
| `tools`        | `Chat.AnyTool[]`             | No       | The tools to make available for the structured completion |
| `debugName`    | `string`                     | No       | The debug name for the structured completion              |
| `debounceTime` | `number`                     | No       | The debounce time between sends to the endpoint           |
| `retries`      | `number`                     | No       | The number of retries if an error is received             |

---

### API Reference

<hb-next-steps>
  <hb-next-step link="/api/react/useStructuredCompletion">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>useStructuredCompletion() API</h4>
      <p>See the full hook</p>
    </div>
  </hb-next-step>
  <hb-next-step link="/api/react/UseStructuredCompletionOptions">
    <div>
      <hb-code />
    </div>
    <div>
      <h4>UseStructuredCompletionOptions API</h4>
      <p>See the options</p>
    </div>
  </hb-next-step>
</hb-next-steps>

---

## Global Predictions

In this example, we'll assume you are using a global state container.
We'll send each action to the LLM and ask it to predict the next possible action a user should consider.

<hb-code-example header="globa predictions">

```tsx
import { useStructuredCompletion, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { useSelector } from 'react-redux';

function Predictions({ smartHomeService }) {
  const lastAction = useSelector(selectLastUserAction);

  const getLights = useTool({
    name: 'getLights',
    description: 'Get all lights in the smart home',
    handler: () => smartHomeService.loadLights(),
    deps: [smartHomeService],
  });

  const getScenes = useTool({
    name: 'getScenes',
    description: 'Get all scenes in the smart home',
    handler: () => smartHomeService.loadScenes(),
    deps: [smartHomeService],
  });

  const predictions = useStructuredCompletion({
    input: lastAction,
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
    tools: [getLights, getScenes],
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

  // ... render UI, predictions.output, etc.
}
```

</hb-code-example>

Let's review the code above:

1. The @hashbrownai/react!useStructuredCompletion:function hook is used to create a resource that predicts the next possible user action based on the last action.
2. The `input` option is set to the last user action, allowing the resource to reactively update when the last action changes.
3. The `system` option provides context to the LLM, instructing it to predict the next possible user action in the app.
4. The `tools` option defines two tools that the LLM can use to get the current state of lights and scenes in the smart home.
5. The `schema` defines the expected structure of the response, which includes an array of predictions with their types and details.

---

## Next Steps

<hb-next-steps>
  <hb-next-step link="concept/components">
    <div>
      <hb-components />
    </div>
    <div>
      <h4>Generate user interfaces</h4>
      <p>Expose React components to the LLM for generative UI.</p>
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
