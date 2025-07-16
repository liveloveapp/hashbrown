# Microsoft Azure

First, install the Microsoft Azure adapter package:

```shell
npm install @hashbrownai/azure
```

## Usage

Currently, the Azure adapter only supports text streaming:

```ts
import { HashbrownAzure } from '@hashbrownai/azure';

// Example: Express.js route handler for streaming Azure completions
app.post('/chat', async (req, res) => {
  const request = req.body; // Should match Hashbrown's CompletionCreateParams shape
  const stream = HashbrownAzure.stream.text({
    apiKey: AZURE_API_KEY,
    endpoint: AZURE_ENDPOINT,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```

Let's break this down:

- `HashbrownAzure.stream.text` is a function that takes an API Key, an endpoint, and a Hashbrown request object, and returns an async iterable stream of encoded data ready to be sent to your frontend. It handles any internal errors that may occur, and forwards them to your frontend.
- `req.body` is the request object that contains the parameters for the chat completion.
- `res.header` sets the response header to `application/octet-stream`, which is required for streaming binary data to your app.
- `res.write` writes each chunk to the response as it arrives.
- `res.end` closes the response when the stream is finished.

## Model Versions

Azure requires model versions to be supplied when making a request. To do this, specify the model version in the `model` string when using any React Hashbrown hook or resource:

```ts
import { useCompletion } from '@hashbrownai/react';

const { output, isReceiving } = useCompletion({
  model: 'gpt-4o@2025-01-01-preview',
  input: 'Hello, world!',
  system: 'You are a helpful assistant.',
});
```
