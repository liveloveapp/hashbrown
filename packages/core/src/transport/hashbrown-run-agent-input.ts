import type { Message, RunAgentInput, Tool } from '@ag-ui/core';
import { Chat } from '../models';
import type { JsonValue } from '../utils';

/**
 * AG-UI run input with Hashbrown framework semantics.
 *
 * @internal
 */
export type HashbrownRunAgentInput = RunAgentInput & {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
};

/**
 * Inputs used to create an AG-UI run request from an owned canonical checkpoint.
 *
 * @internal
 */
export interface CreateCanonicalRunAgentInputOptions {
  readonly threadId: string;
  readonly runId: string;
  readonly messages: readonly Readonly<Message>[];
  readonly state: JsonValue | undefined;
  readonly tools: readonly Chat.Api.Tool[];
  readonly responseSchema?: object;
  readonly ui?: boolean;
}

function mapTool(tool: Chat.Api.Tool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function createHashbrownExtension(
  responseSchema: object | undefined,
  ui: boolean | undefined,
): HashbrownRunAgentInput['hashbrown'] {
  return responseSchema !== undefined || ui === true
    ? {
        ...(responseSchema !== undefined ? { responseSchema } : {}),
        ...(ui === true ? { ui: true } : {}),
      }
    : undefined;
}

/**
 * Creates an AG-UI run input from an already-owned canonical checkpoint.
 *
 * @internal
 */
export function createCanonicalRunAgentInput({
  threadId,
  runId,
  messages,
  state,
  tools,
  responseSchema,
  ui,
}: CreateCanonicalRunAgentInputOptions): HashbrownRunAgentInput {
  const hashbrown = createHashbrownExtension(responseSchema, ui);

  return {
    threadId,
    runId,
    messages: messages as Message[],
    tools: tools.map(mapTool),
    context: [],
    state,
    forwardedProps: {},
    ...(hashbrown ? { hashbrown } : {}),
  };
}
