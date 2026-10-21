import { EventEncoder } from '@ag-ui/encoder';
import { FILTER_SYSTEM_PROMPT, mapFilterSchema } from '@atc/shared';
import { s } from '@hashbrownai/core';
import {
  HashbrownOpenAI,
  type OpenAIHashbrownRunAgentInput,
} from '@hashbrownai/openai';
import type { RunAgentInput } from '@ag-ui/core';
import { type NodeHandler, sendJson } from './http';
import {
  limitRequest,
  pinSystemPrompt,
  readRunInput,
  type RunHandlerOptions,
} from './run-handler';

/** A filter is a small JSON object; this leaves room for reasoning too. */
const FILTER_MAX_OUTPUT_TOKENS = 512;

/** The response schema for a map filter, as Hashbrown's client builds it. */
const FILTER_RESPONSE_SCHEMA = s.toJsonSchema(mapFilterSchema);

/**
 * The run input the model sees: the client's user messages only, no tools,
 * and the server's response schema. Whatever the client sent as system
 * messages, tools or a schema is ignored.
 */
function pinFilterInput(input: RunAgentInput): RunAgentInput {
  const pinned = pinSystemPrompt(
    {
      ...input,
      messages: input.messages.filter((message) => message.role === 'user'),
      tools: [],
    },
    FILTER_SYSTEM_PROMPT,
  );

  return {
    ...pinned,
    forwardedProps: {
      ...pinned.forwardedProps,
      hashbrown: { responseSchema: FILTER_RESPONSE_SCHEMA },
    },
  } as OpenAIHashbrownRunAgentInput;
}

/**
 * `/api/filter`: streams a map filter as AG-UI server-sent events.
 *
 * A public endpoint like `/api/run`: the system prompt, the response schema,
 * the (empty) tool list and the output cap are fixed here. The client sends
 * `{ request, current }` as the user message.
 */
export function createFilterHandler(options: RunHandlerOptions): NodeHandler {
  const reasoningEffort =
    options.reasoningEffort === undefined ? 'low' : options.reasoningEffort;

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
        transformRequestOptions: (request) =>
          limitRequest(request, reasoningEffort, FILTER_MAX_OUTPUT_TOKENS),
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
