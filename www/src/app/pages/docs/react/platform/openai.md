# OpenAI

First, install the OpenAI adapter package:

```shell
npm install @hashbrownai/openai
```

## Usage

Currently, our OpenAI adapter only supports text streaming:

```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;
  const stream = HashbrownOpenAI.stream.text(OPENAI_API_KEY, request);

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
```

Let's break this down:

- `HashbrownOpenAI.stream.text` is a function that takes an API key and a request object, and returns an async iterable stream of text chunks.
- `req.body` is the request object that contains the parameters for the chat completion.
- `res.header` sets the response header to `text/plain`, which is required for streaming.
- `res.write` writes each chunk to the response as it arrives.
- `res.end` closes the response when the stream is finished.

