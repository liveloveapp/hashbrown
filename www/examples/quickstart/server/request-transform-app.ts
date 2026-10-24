import { EventType, type RunAgentInput } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import express, { type ErrorRequestHandler, type Request } from 'express';
import {
  type SupportContext,
  transformSupportRequest,
} from './request-transform';

/** Verified identity selected by application authentication. */
export interface SupportIdentity {
  readonly userId: string;
  readonly workspaceId: string;
}

/** Application integrations and server-owned provider configuration. */
export interface RequestTransformOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseURL?: string;
  readonly origin: string;
  readonly authenticate: (
    request: Request,
    signal: AbortSignal,
  ) => Promise<SupportIdentity | null>;
  readonly loadContext: (
    identity: SupportIdentity,
    signal: AbortSignal,
  ) => Promise<SupportContext | null>;
}

function parseRun(
  body: unknown,
): { input: RunAgentInput } | { status: number; error: string } {
  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: 'Invalid AG-UI request' };
  const input = parsed.data;
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.threadId) ||
    !input.runId ||
    input.runId.length > 120
  )
    return { status: 400, error: 'Invalid run identity' };
  if (input.messages.length > 100)
    return { status: 413, error: 'Conversation is too large' };
  if (input.tools.length || input.resume !== undefined)
    return { status: 400, error: 'This endpoint supports text questions only' };
  const messages = input.messages.filter(
    (message) => message.role !== 'system' && message.role !== 'developer',
  );
  if (
    messages.some(
      (message) =>
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0),
    )
  )
    return { status: 400, error: 'Only plain text is supported' };
  const user = messages.at(-1);
  if (
    user?.role !== 'user' ||
    typeof user.content !== 'string' ||
    !user.content.trim()
  )
    return { status: 400, error: 'End the request with a user question' };
  if (user.content.length > 4000)
    return { status: 413, error: 'Question is too large' };
  return {
    input: {
      threadId: input.threadId,
      runId: input.runId,
      messages: [{ id: user.id, role: 'user', content: user.content.trim() }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    },
  };
}

/**
 * Creates a bounded support endpoint with a real provider request transform.
 * Identity and context access belong to the application; either failure stops
 * the run before a provider request. This endpoint accepts independent text questions.
 */
export function createRequestTransformApp(options: RequestTransformOptions) {
  if (new URL(options.origin).origin !== options.origin)
    throw new Error('Configure an application origin without a path');
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.post('/api/transformed-chat', async (req, res) => {
    if (req.get('origin') !== options.origin) {
      res.status(403).json({ error: 'This request origin is not allowed' });
      return;
    }
    const parsed = parseRun(req.body as unknown);
    if ('status' in parsed) {
      res.status(parsed.status).json({ error: parsed.error });
      return;
    }
    const controller = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    const encoder = new EventEncoder();
    try {
      let identity: SupportIdentity | null;
      try {
        identity = await options.authenticate(req, controller.signal);
      } catch {
        if (!controller.signal.aborted)
          res
            .status(503)
            .json({ error: 'Identity verification is unavailable' });
        return;
      }
      if (controller.signal.aborted) return;
      if (!identity) {
        res.status(401).json({ error: 'Sign in to continue' });
        return;
      }
      res.setHeader('Content-Type', encoder.getContentType());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = HashbrownOpenAI.stream.text({
        apiKey: options.apiKey,
        model: options.model,
        baseURL: options.baseURL,
        input: parsed.input,
        signal: controller.signal,
        transformRequestOptions: async (request) => {
          controller.signal.throwIfAborted();
          let context: SupportContext | null;
          try {
            context = await options.loadContext(identity, controller.signal);
          } catch {
            controller.signal.throwIfAborted();
            throw new Error('Workspace context is unavailable');
          }
          controller.signal.throwIfAborted();
          if (!context) throw new Error('This workspace is unavailable');
          return transformSupportRequest(request, context);
        },
      });
      for await (const event of stream) {
        if (controller.signal.aborted) break;
        // Do not send provider errors or context-lookup details to the browser.
        res.write(
          encoder.encodeSSE(
            event.type === EventType.RUN_ERROR
              ? {
                  ...event,
                  message:
                    'The request could not finish. Ask the assistant to try again.',
                }
              : event,
          ),
        );
      }
      if (!controller.signal.aborted) res.end();
    } catch {
      if (!controller.signal.aborted) {
        if (!res.headersSent)
          res.status(503).json({ error: 'The request could not start' });
        else
          res.end(
            encoder.encodeSSE({
              type: EventType.RUN_ERROR,
              message:
                'The request could not finish. Ask the assistant to try again.',
            }),
          );
      }
    } finally {
      controller.abort();
      req.off('aborted', disconnect);
      res.off('close', disconnect);
    }
  });
  const jsonError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large';
    res
      .status(tooLarge ? 413 : 400)
      .json({
        error: tooLarge ? 'Request body is too large' : 'Invalid JSON request',
      });
  };
  app.use(jsonError);
  return app;
}
