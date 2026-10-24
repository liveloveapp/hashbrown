import { EventType } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import express, { type ErrorRequestHandler } from 'express';
import {
  type AgentClassifier,
  type AgentHandlers,
  routeAgent,
} from './agent-routing';

/** Dependencies for the local public-data support example. */
export interface AgentAppOptions {
  readonly classify: AgentClassifier;
  readonly handlers?: AgentHandlers;
}

function parseInput(
  body: unknown,
):
  | { readonly status: 400 | 413; readonly error: string }
  | {
      readonly threadId: string;
      readonly runId: string;
      readonly text: string;
    } {
  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success)
    return { status: 400, error: 'Invalid AG-UI run input' } as const;
  const input = parsed.data;
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.threadId) ||
    input.runId.length < 1 ||
    input.runId.length > 120
  )
    return { status: 400, error: 'Invalid run identity' } as const;
  if (
    input.messages.length > 100 ||
    input.messages.some((message) => JSON.stringify(message).length > 10000)
  )
    return { status: 413, error: 'Conversation is too large' } as const;
  if (input.tools.length || input.resume !== undefined)
    return { status: 400, error: 'Only text runs are supported' } as const;
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
    return { status: 400, error: 'Only plain text is supported' } as const;
  const latest = messages.at(-1);
  if (
    latest?.role !== 'user' ||
    typeof latest.content !== 'string' ||
    !latest.content.trim()
  )
    return { status: 400, error: 'End with a user message' } as const;
  if (latest.content.length > 4000)
    return { status: 413, error: 'User message is too large' } as const;
  return {
    threadId: input.threadId,
    runId: input.runId,
    text: latest.content,
  } as const;
}

/**
 * Creates a local AG-UI endpoint over public example data. Hosted deployments
 * must add identity, ownership checks and request controls before customer access.
 */
export function createAgentApp(options: AgentAppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.post('/api/agent', async (req, res) => {
    const input = parseInput(req.body as unknown);
    if ('status' in input) {
      res.status(input.status).json({ error: input.error });
      return;
    }
    const controller = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    const encoder = new EventEncoder();
    res.setHeader('Content-Type', encoder.getContentType());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const identity = { threadId: input.threadId, runId: input.runId };
    try {
      res.write(
        encoder.encodeSSE({ type: EventType.RUN_STARTED, ...identity }),
      );
      const reply = await routeAgent(
        input.text,
        options.classify,
        controller.signal,
        options.handlers,
      );
      controller.signal.throwIfAborted();
      const messageId = `reply-${input.runId}`;
      res.write(
        encoder.encodeSSE({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }),
      );
      res.write(
        encoder.encodeSSE({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: reply,
        }),
      );
      res.write(
        encoder.encodeSSE({ type: EventType.TEXT_MESSAGE_END, messageId }),
      );
      res.write(
        encoder.encodeSSE({ type: EventType.RUN_FINISHED, ...identity }),
      );
      res.end();
    } catch {
      if (controller.signal.aborted) return;
      res.write(
        encoder.encodeSSE({
          type: EventType.RUN_ERROR,
          message: 'The agent could not finish. Choose Run agent to retry.',
        }),
      );
      res.end();
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
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'Request body is too large' : 'Invalid JSON request',
    });
  };
  app.use(jsonError);
  return app;
}
