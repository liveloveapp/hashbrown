# Microsoft Azure

First, install the Microsoft Azure adapter package:

```shell
npm install @hashbrownai/azure
```

## Usage

Currently, our Azure adapter only supports text streaming:

```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;
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

- `HashbrownAzure.stream.text` is a function that takes an API key, an endpoint, and a Hashbrown request object, and returns an async iterable stream of encoded data ready to be sent to your frontend.
- `req.body` is the request object that contains the parameters for the chat completion.
- `res.header` sets the response header to `application/octet-stream`, which is required for streaming binary data to your app.
- `res.write` writes each chunk to the response as it arrives.
- `res.end` closes the response when the stream is finished.

## Model Versions

Azure requires model versions to be supplied when making a request. To do this, specify the model version in the `model` string when supplied to any resource:

```ts
completionResource({
  model: 'gpt-4o@2025-01-01-preview',
  // ...
});
```
