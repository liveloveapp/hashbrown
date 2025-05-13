```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownAzure } from '@hashbrownai/azure';
import express from 'express';

const app = express();

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;
  const stream = HashbrownAzure.stream.text(
    AZURE_API_KEY,
    AZURE_ENDPOINT,
    AZURE_API_VERSION,
    request,
  );

  res.header('Content-Type', 'text/plain');
  for await (const chunk of stream) {
    res.write(JSON.stringify(chunk));
  }
  res.end();
});
```
