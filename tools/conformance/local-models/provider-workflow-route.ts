import type { AGUIEvent } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { HashbrownOllama } from '@hashbrownai/ollama';
import {
  HashbrownOpenAI,
  type OpenAIHashbrownRunAgentInput,
} from '@hashbrownai/openai';
import cors from 'cors';
import express from 'express';

/** Backend-owned settings for an explicitly opted-in local provider workflow. */
export interface LocalWorkflowRouteOptions {
  readonly provider: 'native' | 'responses';
  readonly host: string;
  readonly model: string;
  readonly maxRequests?: number;
  readonly timeoutMs?: number;
}

/** Partial protocol evidence retained even when a workflow fails or is cancelled. */
export interface WorkflowRunEvidence {
  readonly input: OpenAIHashbrownRunAgentInput;
  readonly events: AGUIEvent[];
  request?: unknown;
  elapsedMs?: number;
  failure?: string;
  aborted?: boolean;
}

/** Creates a bounded loopback AG-UI route using real adapters and browser-owned history. */
export function createLocalWorkflowApi(options: LocalWorkflowRouteOptions) {
  const host = new URL(options.host);
  if (
    host.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)
  ) {
    throw new Error('Local workflow providers require an HTTP loopback host.');
  }
  const app = express();
  const evidence: WorkflowRunEvidence[] = [];
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/chat', async (req, res) => {
    if (evidence.length >= (options.maxRequests ?? 12)) {
      res.status(429).json({ error: 'Local workflow request limit reached.' });
      return;
    }
    const input = req.body as OpenAIHashbrownRunAgentInput;
    const record: WorkflowRunEvidence = { input, events: [] };
    evidence.push(record);
    const started = performance.now();
    const controller = new AbortController();
    const deadline = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 90_000,
    );
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    const encoder = new EventEncoder();
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Content-Type', encoder.getContentType());
    res.header('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      const stream =
        options.provider === 'native'
          ? HashbrownOllama.stream.text({
              host: host.href,
              model: options.model,
              input,
              signal: controller.signal,
              transformRequestOptions: (base) => {
                const request = {
                  ...base,
                  options: {
                    ...base.options,
                    temperature: 0,
                    num_predict: 512,
                  },
                };
                record.request = request;
                return request;
              },
            })
          : HashbrownOpenAI.stream.text({
              apiKey: 'local',
              baseURL: new URL('/v1', host).href,
              model: options.model,
              input,
              signal: controller.signal,
              transformRequestOptions: (base) => {
                const request = {
                  ...base,
                  temperature: 0,
                  max_output_tokens: 512,
                };
                record.request = request;
                return request;
              },
            });
      for await (const event of stream) {
        record.events.push(event);
        res.write(encoder.encodeSSE(event));
      }
      if (!res.writableEnded) res.end();
    } catch (cause) {
      record.failure = cause instanceof Error ? cause.message : String(cause);
      res.destroy(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      clearTimeout(deadline);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
      record.elapsedMs = performance.now() - started;
      record.aborted = controller.signal.aborted;
    }
  });
  return { app, evidence };
}
