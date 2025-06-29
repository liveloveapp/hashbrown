import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { Chat, KnownModelIds } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownGoogle } from '@hashbrownai/google';
import { HashbrownWriter } from '@hashbrownai/writer';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'] ?? '';
const WRITER_API_KEY = process.env['WRITER_API_KEY'] ?? '';

const KNOWN_GOOGLE_MODEL_NAMES: KnownModelIds[] = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

const KNOWN_OPENAI_MODEL_NAMES: KnownModelIds[] = [
  'gpt-3.5',
  'gpt-4',
  'gpt-4o',
  'gpt-4o-mini',
  'o1-mini',
  'o1',
  'o1-pro',
  'o3-mini',
  'o3-mini-high',
  'o3',
  'o3-pro',
  'o4-mini',
  'o4-mini-high',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4.5',
];

const KNOWN_WRITER_MODEL_NAMES: KnownModelIds[] = [
  'palmyra-x5',
  'palmyra-x4',
  'palmyra-x-003-instruct',
  'palmyra-vision',
  'palmyra-med',
  'palmyra-fin',
  'palmyra-creative',
];

// Middleware for parsing JSON
app.use(express.json());

/**
 * Chat API endpoint using @hashbrownai adapters
 */
app.post('/api/chat', async (req, res) => {
  try {
    const request = req.body as Chat.Api.CompletionCreateParams;
    const modelName = request.model;
    let stream: AsyncIterable<Uint8Array>;

    if (KNOWN_GOOGLE_MODEL_NAMES.includes(modelName as KnownModelIds)) {
      if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'Google API key not configured' });
      }
      stream = HashbrownGoogle.stream.text({
        apiKey: GOOGLE_API_KEY,
        request,
      });
    } else if (KNOWN_OPENAI_MODEL_NAMES.includes(modelName as KnownModelIds)) {
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
      }
      stream = HashbrownOpenAI.stream.text({
        apiKey: OPENAI_API_KEY,
        request,
      });
    } else if (KNOWN_WRITER_MODEL_NAMES.includes(modelName as KnownModelIds)) {
      if (!WRITER_API_KEY) {
        return res.status(500).json({ error: 'Writer API key not configured' });
      }
      stream = HashbrownWriter.stream.text({
        apiKey: WRITER_API_KEY,
        request,
      });
    } else {
      return res.status(400).json({
        error: `Unknown model: ${modelName}. Supported models: ${[
          ...KNOWN_OPENAI_MODEL_NAMES,
          ...KNOWN_GOOGLE_MODEL_NAMES,
          ...KNOWN_WRITER_MODEL_NAMES,
        ].join(', ')}`,
      });
    }

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
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apiKeys: {
      openai: !!OPENAI_API_KEY,
      google: !!GOOGLE_API_KEY,
      writer: !!WRITER_API_KEY,
    },
  });
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
 * Request handler used by the Angular CLI (for dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
