# Structured Output

We think that streaming structured output from an LLM opens lots of interesting opportunities for Angular developers to build intelligent web applications that leverage the power of natural language.

---

## Example

[Run the structured output example in Stackblitz](/examples/angular/structured-output)

A few notes:

- First, you will need an OpenAI API key.
- Try the prompt: `"List the lights"`. That will provide you with

---

## Demo

<div style="padding:59.64% 0 0 0;position:relative; width:100%;"><iframe src="https://player.vimeo.com/video/1089273215?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="hashbrown structured output"></iframe></div>

---

## Structured Chat

Suppose your web application requires a user to schedule an event.
Traditionally, you might reach for a complex set of form controls.
With hashbrown, your customers can simple use natural language.

Let's look at an example using the @hashbrownai/angular!structuredChatResource:function function.

<www-code-example header="calendar.ts">

```ts
chat = structuredChatResource({
  model: 'gpt-4.1',
  system: `
    You are a scheduling assistant. The user will provide a brief description
    of the date, time, and recurrence frequency for an event.

    Your job is to parse the provided input and return a JSON object using the
    recurrence rule specification.
  `,
  output: s.object('rrule', {
    freq: s.enumeration('Recurrence frequency (FREQ)', [
      'SECONDLY',
      'MINUTELY',
      'HOURLY',
      'DAILY',
      'WEEKLY',
      'MONTHLY',
      'YEARLY',
    ]),
    until: s.anyOf([
      s.nullish(),
      s.string('End date-time (UNTIL) in UTC format YYYYMMDDTHHMMSSZ'),
    ]),
    count: s.anyOf([
      s.nullish(),
      s.number('Number of occurrences (COUNT)'),
    ]),
    interval: s.anyOf([
      s.nullish(),
      s.number('Interval between recurrences (INTERVAL); default is 1'),
    ]),
    bysecond: s.anyOf([
      s.nullish(),
      s.array(
        'Seconds list (BYSECOND)',
        s.number('Second value between 0 and 59'),
      ),
    ]),
    byminute: s.anyOf([
      s.nullish(),
      s.array(
        'Minutes list (BYMINUTE)',
        s.number('Minute value between 0 and 59'),
      ),
    ]),
    byhour: s.anyOf([
      s.nullish(),
      s.array(
        'Hours list (BYHOUR)',
        s.number('Hour value between 0 and 23'),
      ),
    ]),
    bymonthday: s.anyOf([
      s.nullish(),
      s.array(
        'Month days list (BYMONTHDAY)',
        s.number('Day of month between 1 and 31'),
      ),
    ]),
    byyearday: s.anyOf([
      s.nullish(),
      s.array(
        'Year days list (BYYEARDAY)',
        s.number('Day of year between -366 and 366'),
      ),
    ]),
    byweekno: s.anyOf([
      s.nullish(),
      s.array(
        'Week numbers list (BYWEEKNO)',
        s.number('ISO week number between -53 and 53'),
      ),
    ]),
    bymonth: s.anyOf([
      s.nullish(),
      s.array('By month', s.number('Month value between 1 and 12')),
    ]),
    bysetpos: s.anyOf([
      s.nullish(),
      s.array(
        'Set positions list (BYSETPOS)',
        s.number('Set position between -366 and 366'),
      ),
    ]),
    byday: s.anyOf([
      s.nullish(),
      s.array(
        'Days of week list (BYDAY)',
        s.string('Two-letter day code: MO, TU, WE, TH, FR, SA, SU'),
      ),
    ]),
    wkst: s.anyOf([
      s.nullish(),
      s.string('Week start day code: MO, TU, WE, TH, FR, SA, SU'),
    ]),
  })
});

sendMessage(message: string) {
  this.chat.sendMessage({ role: 'user', content: message });
}
```

</www-code-example>

The example above levarages the natural language capabilities of an LLM to generate a recurrence rule for input into a calendar scheduling service.

Let's quickly review:

- The @hashbrownai/angular!structuredChatResource:function function is used to create a chat resource where the schema of the the structured output is specified.
- The `prompt` provides context to the LLM, instructing it to act as a scheduling assistant.
- The `output` defines the expected structure of the response, using a schema that describes the recurrence rule format using hashbrown's LLM-optimized schema language.

When the user sends a message like `"Schedule a meeting every Monday at 10 AM"`, the LLM will parse this input and return a structured JSON object that can be used directly in your application.

Here is what the output might look like:

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

The @hashbrownai/angular!structuredCompletionResource:function function builds on top of the @hashbrownai/angular!structuredChatResource:function function by providing an additional `input` option.

This enables Angular developers to build reactive input/output LLM resources for building meaningful user experiences in their web applications.

Let's look at the [scene form dialog from our sample application](https://github.com/liveloveapp/hashbrown/blob/main/samples/smart-home/client/src/app/features/scenes/scene-form-dialog/scene-form-dialog.component.ts).

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

Let's review the code above.

- The @hashbrownai/angular!structuredCompletionResource:function function is used to create a resource that predicts lights based on the scene name.
- The `input` option is set to a signal that contains the scene name, allowing the resource to reactively update when the scene name changes.
- The `system` option provides context to the LLM, instructing it to predict lights based on the scene name.
- The `schema` defines the expected structure of the response, which includes an array of lights with their IDs and brightness levels.

When the user types a scene name, the LLM will predict which lights should be added to the scene and return a structured JSON object that can be used directly in your application.
