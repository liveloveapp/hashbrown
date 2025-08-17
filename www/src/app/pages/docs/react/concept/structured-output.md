# Structured Output

We think that streaming structured output from an LLM opens lots of interesting opportunities for React developers to build intelligent web applications that leverage the power of natural language.

There are many use cases for structured output. Here are a few.

- Replace forms with natural language input via text
- Generate customized dashboards from ambient application state
- Enable users to navigate, query, build, and customize the entire application user interface using natural language

We think these are just a few of the use cases, and we're excited to see what you dream and build with Hashbrown.

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## Idea: Replacing Forms with Natural Language

The primary purpose of a form is to collect structured data from a user.

There are several problems that arise from using a form:

- First, the designer and developer of an application has to identify the navigational flow, layout, and user interface for the form.
- Second, the user must learn the navigation flow and how to complete the form.
- Third, users often get it wrong, so the developer has to validate the user inputs and provide feedback to the user.

Finally, these problems do not even consider accessibility, internationalization, and localization.

We think it's time to replace forms on the web with natural language inputs.

---

## Structured Chat

In this first example we'll implement scheduling a calendar event using natural language using the `useStructuredChat` hook from `@hashbrownai/react`!

<www-code-example header="calendar.tsx">

```tsx
import { useStructuredChat } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const recurrenceRuleSchema = s.object('rrule', {
  freq: s.enumeration('Recurrence frequency (FREQ)', ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  until: s.anyOf([s.nullish(), s.string('End date-time (UNTIL) in UTC format YYYYMMDDTHHMMSSZ')]),
  count: s.anyOf([s.nullish(), s.number('Number of occurrences (COUNT)')]),
  interval: s.anyOf([s.nullish(), s.number('Interval between recurrences (INTERVAL); default is 1')]),
  bysecond: s.anyOf([s.nullish(), s.array('Seconds list (BYSECOND)', s.number('Second value between 0 and 59'))]),
  byminute: s.anyOf([s.nullish(), s.array('Minutes list (BYMINUTE)', s.number('Minute value between 0 and 59'))]),
  byhour: s.anyOf([s.nullish(), s.array('Hours list (BYHOUR)', s.number('Hour value between 0 and 23'))]),
  bymonthday: s.anyOf([s.nullish(), s.array('Month days list (BYMONTHDAY)', s.number('Day of month between 1 and 31'))]),
  byyearday: s.anyOf([s.nullish(), s.array('Year days list (BYYEARDAY)', s.number('Day of year between -366 and 366'))]),
  byweekno: s.anyOf([s.nullish(), s.array('Week numbers list (BYWEEKNO)', s.number('ISO week number between -53 and 53'))]),
  bymonth: s.anyOf([s.nullish(), s.array('By month', s.number('Month value between 1 and 12'))]),
  bysetpos: s.anyOf([s.nullish(), s.array('Set positions list (BYSETPOS)', s.number('Set position between -366 and 366'))]),
  byday: s.anyOf([s.nullish(), s.array('Days of week list (BYDAY)', s.string('Two-letter day code: MO, TU, WE, TH, FR, SA, SU'))]),
  wkst: s.anyOf([s.nullish(), s.string('Week start day code: MO, TU, WE, TH, FR, SA, SU')]),
});

function CalendarChat() {
  const chat = useStructuredChat({
    model: 'gpt-4.1',
    system: `
      You are a scheduling assistant. The user will provide a brief description
      of the date, time, and recurrence frequency for an event.

      Your job is to parse the provided input and return a JSON object using the
      recurrence rule specification.
    `,
    schema: recurrenceRuleSchema,
  });

  const sendMessage = (message: string) => {
    chat.sendMessage({ role: 'user', content: message });
  };

  // ... render UI, messages, etc.
}
```

</www-code-example>

The example above leverages the natural language capabilities of an LLM to generate a recurrence rule for input into a calendar scheduling service.

Let's quickly review:

- The `useStructuredChat` hook is used to create a chat resource where the schema of the structured output is specified.
- The `system` prompt provides context to the LLM, instructing it to act as a scheduling assistant.
- The `schema` defines the expected structure of the response, using a schema that describes the recurrence rule format using Hashbrown's LLM-optimized schema language.

When the user sends a message like `"Schedule a meeting every Monday at 10 AM"`, the LLM will parse this input and return a structured JSON object that can be used directly in your application.

Here is what the output will look like:

```json
{
  "rrule": {
    "freq": "WEEKLY",
    "interval": 1,
    "byday": ["MO"],
    "byhour": [10],
    "byminute": [0],
    "bysecond": [0],
    "wkst": "MO"
  }
}
```

---

## Structured Completions

The `useStructuredCompletion` hook builds on top of the `useStructuredChat` hook by providing an additional `input` option.

This enables React developers to build reactive input/output LLM resources for building meaningful user experiences in their web applications.

Let's look at another example:

<www-code-example header="SceneFormDialog.tsx">

```tsx
import { useStructuredCompletion } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { useMemo } from 'react';

function SceneFormDialog({ sceneName, lights }) {
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

  const predictedLights = useStructuredCompletion({
    model: 'gpt-4.1',
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

  // ... render UI, predictedLights.output, etc.
}
```

</www-code-example>

Let's review the code above.

- The `useStructuredCompletion` hook is used to create a resource that predicts lights based on the scene name.
- The `input` option is set to a memoized value that contains the scene name and additional context. This value updates each time the scene name or lights change, and sends them along.
- The `system` option provides context to the LLM, instructing it to predict lights based on the scene name.
- The `schema` defines the expected structure of the response, which includes an array of lights with their IDs and brightness levels.

When the user types a scene name, the LLM will predict which lights should be added to the scene and return a structured JSON object that can be used directly in your application.

---

## Global Predictions

In this example, we'll assume you are using a global state container.
We'll send each action to the LLM and ask it to predict the next possible action a user should consider.

<www-code-example header="predictions.tsx">

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
  });

  const getScenes = useTool({
    name: 'getScenes',
    description: 'Get all scenes in the smart home',
    handler: () => smartHomeService.loadScenes(),
  });

  const predictions = useStructuredCompletion({
    model: 'gpt-4.1',
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

</www-code-example>

Let's review the code above:

- The `useStructuredCompletion` hook is used to create a resource that predicts the next possible user action based on the last action.
- The `input` option is set to the last user action, allowing the resource to reactively update when the last action changes.
- The `system` option provides context to the LLM, instructing it to predict the next possible user action in the app.
- The `tools` option defines two tools that the LLM can use to get the current state of lights and scenes in the smart home.
- The `schema` defines the expected structure of the response, which includes an array of predictions with their types and details.

When the user performs an action, the LLM will predict the next possible actions and return a structured JSON object.
From there, you can wire up a toast notification to be displayed when the LLM provides a prediction.
When the user accepts the predictive action, dispatch the action and update the state of the app accordingly.

---

## Conclusion

We have explored how to use structured chat and structured completions to build applications that can parse user input and generate structured data.
Structured output from LLMs opens up a world of possibilities for React developers to create intelligent applications that can understand and respond to natural language.
