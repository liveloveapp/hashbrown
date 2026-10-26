import { EventEncoder } from '@ag-ui/encoder';
import { SYSTEM_PROMPT } from '@atc/shared';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import {
  MAX_OUTPUT_TOKENS,
  pinResponseSchema,
  pinSystemPrompt,
  pinTools,
} from './run-policy';
export {
  PINNED_RESPONSE_SCHEMA,
  PINNED_RESPONSE_SCHEMAS,
  pinResponseSchema,
  pinSystemPrompt,
  pinTools,
} from './run-policy';
import type OpenAI from 'openai';
import { type NodeHandler, sendJson } from './http';
import { readRunInput } from './run-input';
export { readRunInput } from './run-input';

type ReasoningEffort = NonNullable<OpenAI.ReasoningEffort>;

/** Every effort the installed OpenAI types allow; the type fails on a missing or extra key. */
const REASONING_EFFORTS: Record<ReasoningEffort, true> = {
  none: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};

const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';

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

  return {
    apiKey,
    model: env['OPENAI_MODEL'] ?? 'gpt-5-mini',
    baseURL: env['OPENAI_BASE_URL'],
    reasoningEffort: parseReasoningEffort(env['OPENAI_REASONING_EFFORT']),
  };
}

/**
 * Checked at startup: a typo would otherwise surface only as an OpenAI 400 on
 * the first question.
 */
export function parseReasoningEffort(
  value: string | undefined,
): ReasoningEffort | null {
  if (value === undefined) {
    return DEFAULT_REASONING_EFFORT;
  }
  if (value === '') {
    return null;
  }
  if (!Object.hasOwn(REASONING_EFFORTS, value)) {
    throw new Error(
      `OPENAI_REASONING_EFFORT must be one of ${Object.keys(REASONING_EFFORTS).join(', ')}, or empty for none`,
    );
  }

  return value as ReasoningEffort;
}

/**
 * The o-series and gpt-5 and later accept `reasoning.effort`. Other models,
 * including `-chat` variants such as `gpt-5-chat-latest`, are not reasoning
 * models and can reject it with a 400. This is the rule the OpenAI provider
 * uses to request reasoning summaries.
 */
const REASONING_MODEL = /^(o\d|gpt-(?:[5-9]|\d{2,})(?!\d))/i;
const CHAT_MODEL = /-chat(?:-|$)/i;

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL.test(model) && !CHAT_MODEL.test(model);
}

/**
 * Caps the Responses request's `max_output_tokens` and adds a reasoning effort
 * for models that accept one. The effort merges into any `reasoning` the
 * provider already set, so its summary setting survives. Low effort roughly
 * halves the time to the first token for this tool-heavy prompt.
 * `maxOutputTokens` defaults to the cap for an atc answer; `/api/filter`
 * passes a smaller one.
 */
export function limitRequest(
  request: OpenAI.Responses.ResponseCreateParamsStreaming,
  reasoningEffort: ReasoningEffort | null,
  maxOutputTokens: number = MAX_OUTPUT_TOKENS,
): OpenAI.Responses.ResponseCreateParamsStreaming {
  return {
    ...request,
    max_output_tokens: maxOutputTokens,
    ...(reasoningEffort !== null && isReasoningModel(request.model ?? '')
      ? { reasoning: { ...request.reasoning, effort: reasoningEffort } }
      : {}),
  };
}

/**
 * `/api/run`: streams the model's answer as AG-UI server-sent events.
 *
 * A public endpoint: the system prompt, the tools, the UI response schema and
 * the output length are fixed here, so the route can only run atc.
 */
export function createRunHandler(options: RunHandlerOptions): NodeHandler {
  const reasoningEffort =
    options.reasoningEffort === undefined
      ? DEFAULT_REASONING_EFFORT
      : options.reasoningEffort;

  return async (req, res) => {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Use POST' });
    }
    const input = await readRunInput(req, res);
    if (input === null) {
      return;
    }
    // A closed stream (the user pressed Stop or left) cancels the OpenAI call too.
    const abortController = new AbortController();
    res.once('close', () => abortController.abort());
    try {
      const encoder = new EventEncoder();
      const stream = HashbrownOpenAI.stream.text({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model,
        input: pinSystemPrompt(
          pinResponseSchema({ ...input, tools: pinTools(input.tools ?? []) }),
          SYSTEM_PROMPT,
        ),
        signal: abortController.signal,
        transformRequestOptions: (request) =>
          limitRequest(request, reasoningEffort),
      });
      // Server-sent events: no caching or transforms, and no proxy buffering
      // (X-Accel-Buffering), so each event reaches the browser as it is written.
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
