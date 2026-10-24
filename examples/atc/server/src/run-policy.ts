import type { RunAgentInput, Tool } from '@ag-ui/core';
import {
  ATC_TOOL_DEFINITIONS,
  type AtcToolName,
  FULL_RESPONSE_SCHEMA,
  RESPONSE_SCHEMA_ALLOWLIST,
} from '@atc/shared';
import { s } from '@hashbrownai/core';

type HashbrownRunInput = RunAgentInput & {
  forwardedProps?: { hashbrown?: { responseSchema?: Record<string, unknown> } };
};

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
export const MAX_OUTPUT_TOKENS = 4096;

/** Whether a JSON value contains the message list required by the run endpoint. */
export function isRunInput(value: unknown): value is RunAgentInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { messages?: unknown }).messages)
  );
}

/** Whether the message count or serialized size exceeds the endpoint limits. */
export function isTooLarge(input: RunAgentInput): boolean {
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

/**
 * The UI the model may render when every card is available (see
 * `FULL_RESPONSE_SCHEMA`). This is also what replaces a schema that is not
 * allowlisted.
 */
export const PINNED_RESPONSE_SCHEMA = FULL_RESPONSE_SCHEMA;

/** Every response schema a client may send; see `RESPONSE_SCHEMA_ALLOWLIST`. */
export const PINNED_RESPONSE_SCHEMAS = RESPONSE_SCHEMA_ALLOWLIST;

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
  const { forwardedProps } = input as HashbrownRunInput;
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
  } as RunAgentInput;
}
