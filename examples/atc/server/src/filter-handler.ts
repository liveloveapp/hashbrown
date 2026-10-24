import { EventEncoder } from '@ag-ui/encoder';
import { FILTER_SYSTEM_PROMPT, mapFilterSchema } from '@atc/shared';
import { s } from '@hashbrownai/core';
import {
  HashbrownOpenAI,
  type OpenAIHashbrownRunAgentInput,
} from '@hashbrownai/openai';
import type { RunAgentInput } from '@ag-ui/core';
import type OpenAI from 'openai';
import { type NodeHandler, sendJson } from './http';
import { limitRequest, type RunHandlerOptions } from './run-handler';
import { pinSystemPrompt } from './run-policy';
import { readRunInput } from './run-input';

/** A filter is a small JSON object; this leaves room for reasoning too. */
const FILTER_MAX_OUTPUT_TOKENS = 512;

/**
 * The gpt-5 base family (gpt-5, gpt-5-mini, gpt-5-nano and their dated
 * snapshots) is the only one that accepts `minimal`; gpt-5.1 and later and
 * the o-series reject it with a 400.
 */
const MINIMAL_EFFORT_MODEL =
  /^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/i;

/**
 * Caps a `/api/filter` Responses request. Reasoning tokens count against the
 * cap, so the filter reasons as little as its model allows, whatever effort
 * `/api/run` is configured with: `minimal` for the gpt-5 base family, `low`
 * for other reasoning models, and no effort for models that do not reason.
 */
export function limitFilterRequest(
  request: OpenAI.Responses.ResponseCreateParamsStreaming,
): OpenAI.Responses.ResponseCreateParamsStreaming {
  const effort = MINIMAL_EFFORT_MODEL.test(request.model ?? '')
    ? 'minimal'
    : 'low';

  return limitRequest(request, effort, FILTER_MAX_OUTPUT_TOKENS);
}

/** The response schema for a map filter, as Hashbrown's client builds it. */
const FILTER_RESPONSE_SCHEMA = s.toJsonSchema(mapFilterSchema);

/**
 * The run input the model sees, built from scratch: the client's last user
 * message (the `{ request, current }` contract) and nothing else. Its other
 * messages, tools, context, state and props are ignored.
 */
function pinFilterInput(input: RunAgentInput): RunAgentInput {
  const last = input.messages.findLast((message) => message.role === 'user');

  return pinSystemPrompt(
    {
      threadId: input.threadId,
      runId: input.runId,
      messages: last === undefined ? [] : [last],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { hashbrown: { responseSchema: FILTER_RESPONSE_SCHEMA } },
    } as OpenAIHashbrownRunAgentInput,
    FILTER_SYSTEM_PROMPT,
  );
}

/**
 * `/api/filter`: streams a map filter as AG-UI server-sent events.
 *
 * A public endpoint like `/api/run`: the system prompt, the response schema,
 * the (empty) tool list and the output cap are fixed here. The client sends
 * `{ request, current }` as the user message.
 */
export function createFilterHandler(options: RunHandlerOptions): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Use POST' });
    }
    const input = await readRunInput(req, res);
    if (input === null) {
      return;
    }
    const abortController = new AbortController();
    res.once('close', () => abortController.abort());
    try {
      const encoder = new EventEncoder();
      const stream = HashbrownOpenAI.stream.text({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model,
        input: pinFilterInput(input),
        signal: abortController.signal,
        transformRequestOptions: limitFilterRequest,
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
      console.error('[atc] filter failed', error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Filter failed' });
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
  };
}
