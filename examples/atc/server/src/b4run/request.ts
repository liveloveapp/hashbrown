import type { RunAgentInput } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { pinResponseSchema, pinTools } from '../run-policy';

const IDENTITY = /^[a-zA-Z0-9_.:-]{1,128}$/;

/**
 * Builds the only AG-UI envelope the ATC agent accepts. Hashbrown keeps browser
 * tool execution; b4.run receives pinned definitions, results, and the selected
 * schema, with its own server-owned system prompt.
 */
export function normalizeAgentRequest(input: RunAgentInput): RunAgentInput {
  const parsed = RunAgentInputSchema.parse({
    threadId: input.threadId,
    runId: input.runId,
    messages: input.messages,
    tools: input.tools ?? [],
    context: [],
    state: {},
    forwardedProps: input.forwardedProps,
  });
  if (!IDENTITY.test(parsed.threadId) || !IDENTITY.test(parsed.runId)) {
    throw new Error('Invalid conversation or run identity');
  }
  const pinned = pinResponseSchema(parsed);
  const schema = pinned.forwardedProps?.hashbrown?.responseSchema;

  return {
    threadId: parsed.threadId,
    runId: parsed.runId,
    messages: parsed.messages.filter(
      ({ role }) => role !== 'system' && role !== 'developer',
    ),
    tools: pinTools(parsed.tools),
    context: [],
    state: {},
    forwardedProps: schema === undefined ? {} : { responseSchema: schema },
  };
}
