import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';
// import { INGREDIENTS } from './ingredients';

export function createApi() {
  const app = express();

  const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
  const OPENAI_BASE_URL = process.env['OPENAI_BASE_URL'];
  const OPENAI_MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-5-nano';

  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    try {
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const abortController = new AbortController();
      req.once('aborted', () => abortController.abort());
      res.once('close', () => abortController.abort());

      const input = req.body as RunAgentInput;
      const stream = HashbrownOpenAI.stream.text({
        apiKey: OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL,
        model: OPENAI_MODEL,
        input,
        signal: abortController.signal,
      });
      const encoder = new EventEncoder();

      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Content-Type', encoder.getContentType());
      res.header('Connection', 'keep-alive');
      res.flushHeaders();

      for await (const event of stream) {
        res.write(encoder.encodeSSE(event));
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      console.error('Chat API error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // app.get('/api/ingredients', (req, res) => {
  //   const {
  //     startDate: startDateString,
  //     endDate: endDateString,
  //     ingredientIds,
  //   } = req.query;

  //   if (!startDateString || !endDateString) {
  //     return res
  //       .status(400)
  //       .json({ error: 'startDate and endDate are required' });
  //   }

  //   const startDate = new Date(startDateString as string);
  //   const endDate = new Date(endDateString as string);

  //   const ingredients = INGREDIENTS.filter((ingredient) => {
  //     if (
  //       ingredientIds &&
  //       Array.isArray(ingredientIds) &&
  //       !(ingredientIds as string[]).includes(ingredient.id)
  //     ) {
  //       return false;
  //     }
  //     return true;
  //   }).map((ingredient) => ({
  //     ...ingredient,
  //     dailyReports: ingredient.dailyReports.filter((report) => {
  //       return (
  //         new Date(report.date) >= startDate && new Date(report.date) <= endDate
  //       );
  //     }),
  //   }));

  //   return res.json(ingredients);
  // });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
