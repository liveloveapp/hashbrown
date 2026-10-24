import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import express from 'express';
import { selectionSchema } from '../runtime/selection';

// Local development endpoint. A hosted application must add its own authentication,
// authorization and request controls before exposing this credential-backed route.
const apiKey = process.env['TYPESAFE_API_KEY'];
const model = process.env['TYPESAFE_MODEL'];
if (!apiKey || !model)
  throw new Error('Set TYPESAFE_API_KEY and TYPESAFE_MODEL in .env');

const app = express();
app.use(express.json({ limit: '16kb' }));

app.post('/api/decide', async (req, res) => {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await HashbrownTypeSafe.decide({
      apiKey,
      model,
      request: req.body as unknown,
      // The browser cannot replace our candidate IDs, descriptions or order.
      schema: selectionSchema,
      maxRequestChars: 16_000,
      signal: controller.signal,
    });
    if (!controller.signal.aborted) res.json(result);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof DecisionError) {
      res.status(error.status).json({ error: error.code });
    } else {
      res.status(500).json({ error: 'Could not choose a view' });
    }
  }
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Hashbrown decision endpoint: http://127.0.0.1:3001/api/decide');
});
