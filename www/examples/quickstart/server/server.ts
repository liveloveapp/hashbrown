import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';

const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (!apiKey || !model)
  throw new Error('Set OPENAI_API_KEY and OPENAI_MODEL in .env');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const encoder = new EventEncoder();
  res.setHeader('Content-Type', encoder.getContentType());
  res.setHeader('Cache-Control', 'no-cache, no-store');

  try {
    const stream = HashbrownOpenAI.stream.text({
      apiKey,
      model,
      input: req.body as RunAgentInput,
      signal: controller.signal,
    });
    for await (const event of stream) {
      if (controller.signal.aborted) break;
      res.write(encoder.encodeSSE(event));
    }
    res.end();
  } catch {
    if (!res.headersSent) res.status(500).end('Could not start the response');
    else res.destroy();
  }
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Hashbrown endpoint: http://127.0.0.1:3001/api/chat');
});
