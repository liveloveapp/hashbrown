import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { SYSTEM_PROMPT } from '@atc/shared';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { type NodeHandler, readJsonBody, sendJson } from './http';

/** Model settings for `/api/run`. The client never chooses the model. */
export interface RunHandlerOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
}

/** Reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`) and `OPENAI_BASE_URL`. */
export function readRunOptions(env: NodeJS.ProcessEnv): RunHandlerOptions {
  const apiKey = env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  return {
    apiKey,
    model: env['OPENAI_MODEL'] ?? 'gpt-5-mini',
    baseURL: env['OPENAI_BASE_URL'],
  };
}

/** Drops client system and developer messages and puts the server's prompt first. */
export function pinSystemPrompt(
  input: RunAgentInput,
  prompt: string,
): RunAgentInput {
  return {
    ...input,
    messages: [
      { id: 'atc-system', role: 'system', content: prompt },
      ...input.messages.filter(
        (message) => message.role !== 'system' && message.role !== 'developer',
      ),
    ],
  };
}

/** `/api/run`: streams the model's answer as AG-UI server-sent events. */
export function createRunHandler(options: RunHandlerOptions): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Use POST' });
    }
    let input: RunAgentInput;
    try {
      input = (await readJsonBody(req)) as RunAgentInput;
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const abortController = new AbortController();
    res.once('close', () => abortController.abort());
    const encoder = new EventEncoder();
    const stream = HashbrownOpenAI.stream.text({
      ...options,
      input: pinSystemPrompt(input, SYSTEM_PROMPT),
      signal: abortController.signal,
      transformRequestOptions: (request) => ({
        ...request,
        reasoning_effort: 'low',
      }),
    });
    res.writeHead(200, {
      'Content-Type': encoder.getContentType(),
      'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
      'X-Accel-Buffering': 'no',
    });
    for await (const event of stream) {
      res.write(encoder.encodeSSE(event));
    }
    if (!res.writableEnded) {
      res.end();
    }
  };
}
