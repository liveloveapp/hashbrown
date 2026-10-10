import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { ATC_TOOL_NAMES, SYSTEM_PROMPT } from '@atc/shared';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import type OpenAI from 'openai';
import {
  BodyTooLargeError,
  type NodeHandler,
  readJsonBody,
  sendJson,
} from './http';

type ReasoningEffort = NonNullable<
  OpenAI.Chat.ChatCompletionCreateParams['reasoning_effort']
>;

/** Model settings for `/api/run`. The client never chooses the model. */
export interface RunHandlerOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly model: string;
  /** Sent to reasoning models only; null sends none. Defaults to `'low'`. */
  readonly reasoningEffort?: ReasoningEffort | null;
}

/**
 * Reads `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`),
 * `OPENAI_BASE_URL` and `OPENAI_REASONING_EFFORT` (default `low`; empty sends none).
 */
export function readRunOptions(env: NodeJS.ProcessEnv): RunHandlerOptions {
  const apiKey = env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const effort = env['OPENAI_REASONING_EFFORT'];

  return {
    apiKey,
    model: env['OPENAI_MODEL'] ?? 'gpt-5-mini',
    baseURL: env['OPENAI_BASE_URL'],
    reasoningEffort:
      effort === undefined
        ? 'low'
        : effort === ''
          ? null
          : (effort as ReasoningEffort),
  };
}

/** Enough for the longest answer atc gives, reasoning included. */
const MAX_OUTPUT_TOKENS = 4096;

const TOOL_NAMES: ReadonlySet<string> = new Set(ATC_TOOL_NAMES);

/** gpt-5 and the o-series accept `reasoning_effort`; other models reject it with a 400. */
const REASONING_MODEL = /^(gpt-5|o\d)/;

/**
 * Narrows the OpenAI request to atc: only the atc tools, a capped output
 * length, and a reasoning effort for models that accept one. Low effort
 * roughly halves the time to the first token for this tool-heavy prompt.
 */
export function limitRequest(
  request: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  options: Pick<RunHandlerOptions, 'reasoningEffort'>,
): OpenAI.Chat.ChatCompletionCreateParamsStreaming {
  const tools = request.tools?.filter(
    (tool) => tool.type === 'function' && TOOL_NAMES.has(tool.function.name),
  );
  const effort = options.reasoningEffort ?? null;

  return {
    ...request,
    tools: tools?.length ? tools : undefined,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    ...(effort !== null && REASONING_MODEL.test(request.model)
      ? { reasoning_effort: effort }
      : {}),
  };
}

/**
 * Drops client system and developer messages and puts the server's prompt
 * first. Hashbrown clients always send a system message; dropping it here
 * means the browser can never change the rules.
 */
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

const MAX_MESSAGES = 100;

/** Per message; the longest tool result (20 aircraft rows) is about 6 kB. */
const MAX_MESSAGE_CHARS = 16_000;

function isRunInput(value: unknown): value is RunAgentInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}

function isTooLarge(input: RunAgentInput): boolean {
  return (
    input.messages.length > MAX_MESSAGES ||
    input.messages.some(
      (message) =>
        typeof message.content === 'string' &&
        message.content.length > MAX_MESSAGE_CHARS,
    )
  );
}

/**
 * `/api/run`: streams the model's answer as AG-UI server-sent events.
 *
 * A public endpoint: the system prompt, the tool list and the output length
 * are fixed here, so the route can only run atc.
 */
export function createRunHandler(options: RunHandlerOptions): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Use POST' });
    }
    let input: unknown;
    try {
      input = await readJsonBody(req);
    } catch (error) {
      return error instanceof BodyTooLargeError
        ? sendJson(
            res,
            413,
            { error: 'Request too large' },
            { Connection: 'close' },
          )
        : sendJson(res, 400, { error: 'Invalid JSON' });
    }
    if (!isRunInput(input)) {
      return sendJson(res, 400, { error: 'Invalid run input' });
    }
    if (isTooLarge(input)) {
      return sendJson(res, 413, { error: 'Request too large' });
    }
    const abortController = new AbortController();
    res.once('close', () => abortController.abort());
    try {
      const encoder = new EventEncoder();
      const stream = HashbrownOpenAI.stream.text({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model,
        input: pinSystemPrompt(
          { ...input, tools: input.tools ?? [] },
          SYSTEM_PROMPT,
        ),
        signal: abortController.signal,
        transformRequestOptions: (request) =>
          limitRequest(request, {
            reasoningEffort: options.reasoningEffort ?? 'low',
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
    } catch (error) {
      console.error('[atc] run failed', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Run failed' });
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
  };
}
