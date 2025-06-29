// Polyfill for global in Edge Functions environment
if (typeof global === 'undefined') {
  (globalThis as any).global = globalThis;
}

import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { getContext } from '@netlify/angular-runtime/context.mjs';
import { Chat, KnownModelIds } from '@hashbrownai/core';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownGoogle } from '@hashbrownai/google';
import { HashbrownWriter } from '@hashbrownai/writer';

const angularAppEngine = new AngularAppEngine();

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

export async function netlifyAppEngineHandler(
  request: Request,
): Promise<Response> {
  const context = getContext();
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle API endpoints
  if (pathname === '/api/chat' && request.method === 'POST') {
    try {
      const requestBody =
        (await request.json()) as Chat.Api.CompletionCreateParams;
      const modelName = requestBody.model;
      let stream: AsyncIterable<Uint8Array>;

      if (KNOWN_GOOGLE_MODEL_NAMES.includes(modelName as KnownModelIds)) {
        if (!GOOGLE_API_KEY) {
          return Response.json(
            { error: 'Google API key not configured' },
            { status: 500 },
          );
        }
        stream = HashbrownGoogle.stream.text({
          apiKey: GOOGLE_API_KEY,
          request: requestBody,
        });
      } else if (
        KNOWN_OPENAI_MODEL_NAMES.includes(modelName as KnownModelIds)
      ) {
        if (!OPENAI_API_KEY) {
          return Response.json(
            { error: 'OpenAI API key not configured' },
            { status: 500 },
          );
        }
        stream = HashbrownOpenAI.stream.text({
          apiKey: OPENAI_API_KEY,
          request: requestBody,
        });
      } else if (
        KNOWN_WRITER_MODEL_NAMES.includes(modelName as KnownModelIds)
      ) {
        if (!WRITER_API_KEY) {
          return Response.json(
            { error: 'Writer API key not configured' },
            { status: 500 },
          );
        }
        stream = HashbrownWriter.stream.text({
          apiKey: WRITER_API_KEY,
          request: requestBody,
        });
      } else {
        return Response.json(
          {
            error: `Unknown model: ${modelName}. Supported models: ${[
              ...KNOWN_OPENAI_MODEL_NAMES,
              ...KNOWN_GOOGLE_MODEL_NAMES,
              ...KNOWN_WRITER_MODEL_NAMES,
            ].join(', ')}`,
          },
          { status: 400 },
        );
      }

      // Create a readable stream for the response
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              controller.enqueue(chunk);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });
    } catch (error) {
      console.error('Chat API error:', error);
      return Response.json(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  }

  // Handle health check endpoint
  if (pathname === '/api/health' && request.method === 'GET') {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      apiKeys: {
        openai: !!OPENAI_API_KEY,
        google: !!GOOGLE_API_KEY,
        writer: !!WRITER_API_KEY,
      },
    });
  }

  // Handle all other requests with Angular
  const result = await angularAppEngine.handle(request, context);
  return result || new Response('Not found', { status: 404 });
}

/**
 * The request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
