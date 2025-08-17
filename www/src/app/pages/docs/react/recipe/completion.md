# Text Completion

Hashbrown's React SDK provides hooks for text completion using LLMs. This guide shows how to use `useCompletion` to fetch completions in your React components.

---

## Basic Usage

Use the `useCompletion` hook to fetch completions based on an input value. The hook manages loading, error, and output state for you.

```tsx
import { useCompletion } from '@hashbrownai/react';

function CompletionExample() {
  const [input, setInput] = React.useState('What is the capital of France?');

  const { output, isReceiving, isSending, error, reload } = useCompletion({
    input,
    model: 'gpt-3.5-turbo', // or any supported model
    system: 'You are a helpful assistant.',
  });

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter your prompt" />
      <button onClick={reload} disabled={isSending || isReceiving}>
        Reload
      </button>
      {isSending || isReceiving ? <p>Loading...</p> : null}
      {error ? <p style={{ color: 'red' }}>{error.message}</p> : null}
      <div>
        <strong>Output:</strong>
        <pre>{output}</pre>
      </div>
    </div>
  );
}
```

---

## Options

The `useCompletion` hook accepts the following options:

| Option         | Type                   | Description                               |
| -------------- | ---------------------- | ----------------------------------------- |
| `input`        | `string \| null`       | The prompt to send to the model.          |
| `model`        | `string`               | The model ID to use.                      |
| `system`       | `string`               | The system prompt for the model.          |
| `debounceTime` | `number` (optional)    | Debounce time in ms for input changes.    |
| `debugName`    | `string` (optional)    | Debug label for this completion instance. |
| `retries`      | `number` (optional)    | Number of retry attempts on failure.      |
| `tools`        | `AnyTool[]` (optional) | Tools to enable for the completion.       |

---

## Return Value

The hook returns an object with the following properties:

| Property             | Type                 | Description                              |
| -------------------- | -------------------- | ---------------------------------------- |
| `output`             | `string \| null`     | The completion result.                   |
| `isReceiving`        | `boolean`            | True if receiving a response.            |
| `isSending`          | `boolean`            | True if sending a request.               |
| `isRunningToolCalls` | `boolean`            | True if tool calls are running.          |
| `error`              | `Error \| undefined` | Error object if an error occurred.       |
| `exhaustedRetries`   | `boolean`            | True if all retries have been exhausted. |
| `reload`             | `() => void`         | Manually refetch the completion.         |

---

## Debouncing

To avoid sending a request on every keystroke, use the `debounceTime` option:

```tsx
const { output } = useCompletion({
  input,
  model: 'gpt-3.5-turbo',
  system: 'You are a helpful assistant.',
  debounceTime: 500, // Wait 500ms after input stops changing
});
```

---

## Error Handling

If an error occurs, the `error` property will be set. You can display it in your UI as shown in the example above.

---

## Manual Reload

Call the `reload` function to manually refetch the completion, for example after changing the input or model.

---

## With Tools

You can pass tools to the completion hook if your model supports tool calling:

```tsx
import { useCompletion, useTool } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

const getWeather = useTool({
  name: 'getWeather',
  description: 'Get the current weather for a city',
  schema: s.object('Weather input', {
    city: s.string('City name'),
  }),
  async handler({ city }) {
    // ...fetch weather data
    return { temperature: 72 };
  },
});

const { output } = useCompletion({
  input: 'What is the weather in Paris?',
  model: 'gpt-4',
  system: 'You are a helpful assistant.',
  tools: [getWeather],
});
```

---

## TypeScript

The `output` is typed as `string | null` by default. For structured output, use `useStructuredCompletion` instead.

---

## See Also

- [Structured Completion](./structured-completion.md)
- [Chat](./chat.md)
- [Tools](./tools.md)
