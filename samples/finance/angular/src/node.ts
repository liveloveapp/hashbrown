import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { Chat } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INGREDIENTS } from './server/ingredients';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Environment variables for API Keys
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];

// Middleware for parsing JSON
app.use(express.json());

/**
 * Chat API endpoint using @hashbrownai adapters
 */
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
    return;
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Ingredients endpoint
 */
app.get('/api/ingredients', (req, res) => {
  const {
    startDate: startDateString,
    endDate: endDateString,
    ingredientIds,
  } = req.query;

  if (!startDateString || !endDateString) {
    return res
      .status(400)
      .json({ error: 'startDate and endDate are required' });
  }
  const startDate = new Date(startDateString as string);
  const endDate = new Date(endDateString as string);
  const ingredients = INGREDIENTS.filter((ingredient) => {
    if (
      ingredientIds &&
      Array.isArray(ingredientIds) &&
      !ingredientIds.includes(ingredient.id)
    ) {
      return false;
    }

    return true;
  }).map((ingredient) => ({
    ...ingredient,
    dailyReports: ingredient.dailyReports.filter((report) => {
      return (
        new Date(report.date) >= startDate && new Date(report.date) <= endDate
      );
    }),
  }));

  return res.json(ingredients);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Chat endpoint: http://localhost:${port}/api/chat`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
