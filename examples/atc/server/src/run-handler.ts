import type { RunAgentInput, Tool } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import {
  aircraftCompareContract,
  airportCardContract,
  arrivalsBoardContract,
  ATC_TOOL_DEFINITIONS,
  type AtcToolName,
  flightCardContract,
  SYSTEM_PROMPT,
} from '@atc/shared';
import { createUiJsonSchema, markdownComponent, s } from '@hashbrownai/core';
import {
  HashbrownOpenAI,
  type OpenAIHashbrownRunAgentInput,
} from '@hashbrownai/openai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type OpenAI from 'openai';
import {
  BodyTooLargeError,
  type NodeHandler,
  readJsonBody,
  sendJson,
} from './http';

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
function parseReasoningEffort(
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

/*
 * A public route's limits on one run: the whole body (256 KiB, in
 * readJsonBody), the number of messages and each message's size. They bound
 * the cost of a request before it reaches OpenAI.
 */

/** Far more than any atc conversation; a longer one is not atc. */
const MAX_MESSAGES = 100;

/**
 * Per message, counting everything in it (text or multipart content, tool
 * call arguments); the longest tool result (20 aircraft rows) is about 6 kB.
 */
const MAX_MESSAGE_CHARS = 16_000;

/** Enough for the longest answer atc gives, reasoning included. */
const MAX_OUTPUT_TOKENS = 4096;

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
      (message) => JSON.stringify(message).length > MAX_MESSAGE_CHARS,
    )
  );
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

/** Each atc tool as the model sees it, built from the shared definitions. */
const PINNED_TOOLS: ReadonlyMap<string, Tool> = new Map(
  Object.values(ATC_TOOL_DEFINITIONS).map(
    ({ name, description, schema }): [AtcToolName, Tool] => [
      name,
      // The same conversion Hashbrown's client applies to a tool's schema.
      { name, description, parameters: s.toJsonSchema(schema) },
    ],
  ),
);

/**
 * The tools the client asked for, each replaced with the server's own
 * definition (description and JSON Schema). Unknown tools and repeats are
 * dropped, so the model only ever sees atc's tools as atc wrote them.
 */
export function pinTools(tools: readonly Tool[]): Tool[] {
  const names = new Set(tools.map((tool) => tool.name));

  return [...names].flatMap((name) => {
    const pinned = PINNED_TOOLS.get(name);

    return pinned === undefined ? [] : [pinned];
  });
}

/** The cards the model may render, in the order both apps expose them. */
const CARD_DEFINITIONS = [
  flightCardContract,
  arrivalsBoardContract,
  aircraftCompareContract,
  airportCardContract,
].map((contract) => ({ ...contract, children: false as const }));

/** The UI response schema for Markdown and some of the cards. */
function responseSchemaFor(
  cards: readonly (typeof CARD_DEFINITIONS)[number][],
) {
  return createUiJsonSchema({ components: [markdownComponent(), ...cards] });
}

/**
 * The UI the model may render when every card is available, built from the
 * same definitions, in the same order, as the components both apps expose.
 * Neither app passes UI examples; if one ever does, pass the same ones here.
 * This is also what replaces a schema that is not allowlisted.
 */
export const PINNED_RESPONSE_SCHEMA = responseSchemaFor(CARD_DEFINITIONS);

/**
 * Every response schema a client may send: Markdown plus each of the 15
 * non-empty subsets of the four cards, in pinned order, the last being the
 * full schema. The apps narrow their cards with UI selection (at most two
 * per turn), and Hashbrown keeps the declared order of the components it
 * keeps, so a narrowed schema is a subset of the pinned order. A schema the
 * browser sends is kept only when it equals one of these.
 */
export const PINNED_RESPONSE_SCHEMAS: readonly Record<string, unknown>[] =
  Array.from({ length: 2 ** CARD_DEFINITIONS.length - 1 }, (_, index) =>
    CARD_DEFINITIONS.filter((_card, bit) => ((index + 1) >> bit) & 1),
  ).map((cards) =>
    cards.length === CARD_DEFINITIONS.length
      ? PINNED_RESPONSE_SCHEMA
      : responseSchemaFor(cards),
  );

const PINNED_RESPONSE_SCHEMAS_BY_JSON: ReadonlyMap<
  string,
  Record<string, unknown>
> = new Map(
  PINNED_RESPONSE_SCHEMAS.map((schema) => [JSON.stringify(schema), schema]),
);

/**
 * Pins the response schema the browser sent. A schema equal to an allowlisted
 * one (`PINNED_RESPONSE_SCHEMAS`: Markdown plus any non-empty subset of the
 * cards) is replaced by the server's own copy; anything else (tampering, or a
 * browser on an older build) is replaced with the full schema, so the model
 * can only render atc's components. A different schema is logged, never
 * rejected and never echoed: it is untrusted and can be large.
 */
export function pinResponseSchema(input: RunAgentInput): RunAgentInput {
  const { forwardedProps } = input as OpenAIHashbrownRunAgentInput;
  const hashbrown = forwardedProps?.hashbrown;
  if (hashbrown?.responseSchema === undefined) {
    return input;
  }
  const allowed = PINNED_RESPONSE_SCHEMAS_BY_JSON.get(
    JSON.stringify(hashbrown.responseSchema),
  );
  if (allowed === undefined) {
    console.warn(
      '[atc] replaced a response schema that is not an allowlisted one',
    );
  }

  return {
    ...input,
    forwardedProps: {
      ...forwardedProps,
      hashbrown: {
        ...hashbrown,
        responseSchema: allowed ?? PINNED_RESPONSE_SCHEMA,
      },
    },
  } as OpenAIHashbrownRunAgentInput;
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
 * The run input of a POST body, with the run limits applied, or null once a
 * 400 or 413 has been sent.
 */
export async function readRunInput(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<RunAgentInput | null> {
  let input: unknown;
  try {
    input = await readJsonBody(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      // The rest of the body was never read, so this connection cannot carry
      // another request.
      sendJson(
        res,
        413,
        { error: 'Request too large' },
        { Connection: 'close' },
      );
    } else {
      sendJson(res, 400, { error: 'Invalid JSON' });
    }

    return null;
  }
  if (!isRunInput(input)) {
    sendJson(res, 400, { error: 'Invalid run input' });

    return null;
  }
  if (isTooLarge(input)) {
    sendJson(res, 413, { error: 'Request too large' });

    return null;
  }

  return input;
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
