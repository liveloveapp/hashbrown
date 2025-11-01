import type { Request, Response } from 'express';
import { Router } from 'express';

import { agent } from '../agents/plan-agent.js';
import { agent as retrieveAgent } from '../agents/retrieve-agent.js';

type AgentMessages = Array<{ content?: unknown }>;

type AgentInvokeResult = {
  messages?: AgentMessages;
  structuredResponse?: unknown;
};

type AgentRuntimeConfig = {
  configurable: { thread_id: string };
  context: { user_id: string };
};

type AgentInstance = {
  invoke: (
    input: { messages: unknown[] },
    config: AgentRuntimeConfig,
  ) => Promise<AgentInvokeResult>;
  stream: (
    input: { messages: unknown[] },
    config: AgentRuntimeConfig & { streamMode?: string },
  ) => Promise<AsyncIterable<Record<string, unknown>>>;
};

type AgentHandlerOptions = {
  routeLabel: string;
  defaultThreadId: string;
};

function normalizeThreadId(provided: unknown, fallback: string): string {
  if (typeof provided === 'string' && provided.trim().length > 0) {
    return provided;
  }
  return fallback;
}

function normalizeUserId(provided: unknown): string {
  if (typeof provided === 'string' && provided.trim().length > 0) {
    return provided;
  }
  return 'anon';
}

function buildAgentConfig(
  defaultThreadId: string,
  threadId: unknown,
  userId: unknown,
): AgentRuntimeConfig {
  return {
    configurable: {
      thread_id: normalizeThreadId(threadId, defaultThreadId),
    },
    context: {
      user_id: normalizeUserId(userId),
    },
  };
}

function extractFinalMessageContent(result: AgentInvokeResult) {
  const messages = result.messages ?? [];
  const finalMessage = messages[messages.length - 1];
  return finalMessage?.content ?? null;
}

function createAgentHandler(
  agentInstance: AgentInstance,
  options: AgentHandlerOptions,
) {
  return async (req: Request, res: Response) => {
    try {
      const {
        messages,
        thread_id,
        user_id,
      }: {
        messages?: unknown;
        thread_id?: unknown;
        user_id?: unknown;
      } = req.body ?? {};

      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: '`messages` must be an array' });
      }

      const config = buildAgentConfig(
        options.defaultThreadId,
        thread_id,
        user_id,
      );

      const result = await agentInstance.invoke({ messages }, config);
      const finalMessage = extractFinalMessageContent(result);

      return res.json({
        structuredResponse: result.structuredResponse,
        final: finalMessage,
      });
    } catch (error) {
      console.error(`[${options.routeLabel}] Error handling request:`, error);
      console.error(
        `[${options.routeLabel}] Error stack:`,
        error instanceof Error ? error.stack : 'No stack',
      );
      return res.status(500).json({
        error: 'internal_error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

function createAgentStreamHandler(
  agentInstance: AgentInstance,
  options: AgentHandlerOptions,
) {
  return async (req: Request, res: Response) => {
    try {
      const {
        messages,
        thread_id,
        user_id,
      }: {
        messages?: unknown;
        thread_id?: unknown;
        user_id?: unknown;
      } = req.body ?? {};

      if (!Array.isArray(messages)) {
        res.status(400).json({ error: '`messages` must be an array' });
        return;
      }

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders?.();

      const config = buildAgentConfig(
        options.defaultThreadId,
        thread_id,
        user_id,
      );

      const stream = await agentInstance.stream(
        { messages },
        {
          ...config,
          streamMode: 'updates',
        },
      );

      req.on('close', () => {
        res.end();
      });

      for await (const update of stream) {
        const [step, content] = Object.entries(update)[0] ?? [];
        if (!step) {
          continue;
        }
        res.write(
          `${JSON.stringify({ event: 'update', step, content }, null, 0)}\n`,
        );
      }

      res.write(`${JSON.stringify({ event: 'done' })}\n`);
      res.end();
    } catch (error) {
      console.error(`[${options.routeLabel}] Error streaming response:`, error);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/x-ndjson');
      }
      res.write(
        `${JSON.stringify({
          event: 'error',
          message: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      res.end();
    }
  };
}

const chatHandler = createAgentHandler(agent as AgentInstance, {
  routeLabel: 'chat',
  defaultThreadId: 'default',
});

const chatStreamHandler = createAgentStreamHandler(agent as AgentInstance, {
  routeLabel: 'chat-stream',
  defaultThreadId: 'default',
});

const retrieveHandler = createAgentHandler(retrieveAgent as AgentInstance, {
  routeLabel: 'retrieve',
  defaultThreadId: 'retrieve-default',
});

const retrieveStreamHandler = createAgentStreamHandler(
  retrieveAgent as AgentInstance,
  {
    routeLabel: 'retrieve-stream',
    defaultThreadId: 'retrieve-default',
  },
);

const router = Router();

router.post('/chat', chatHandler);

router.post('/chat/stream', chatStreamHandler);

router.post('/retrieve', retrieveHandler);

router.post('/retrieve/stream', retrieveStreamHandler);

export const chatRouter = router;
