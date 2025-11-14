import { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';
// import { INGREDIENTS } from './ingredients';

export function createApi() {
  const app = express();

  const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];

  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    try {
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const request = req.body as Chat.Api.CompletionCreateParams;
      const stream = HashbrownOpenAI.stream.text({
        apiKey: OPENAI_API_KEY,
        request,
      });

      res.header('Content-Type', 'application/octet-stream');

      for await (const chunk of stream) {
        res.write(chunk);
      }

      res.end();
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
