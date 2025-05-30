```ts
import { Chat } from '@hashbrownai/core';
import { HashbrownWriter } from '@hashbrownai/writer';
import express from 'express';

const app = express();

app.post('/chat', async (req, res) => {
  const request = req.body as Chat.CompletionCreateParams;
  const stream = HashbrownWriter.stream.text({
    apiKey: WRITER_API_KEY,
    request,
  });

  res.header('Content-Type', 'application/octet-stream');

  for await (const chunk of stream) {
    res.write(chunk);
  }

  res.end();
});
```
