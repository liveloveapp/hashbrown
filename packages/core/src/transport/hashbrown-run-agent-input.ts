import type { Message, RunAgentInput, Tool } from '@ag-ui/core';
import type { ResumeEntry } from '../models/interrupt';
import { Chat } from '../models';
import type { JsonValue } from '../utils';

/**
 * Hashbrown's generation semantics for one AG-UI run.
 *
 * @internal
 */
export interface HashbrownRunAgentExtension {
  responseSchema?: object;
  ui?: boolean;
}

/**
 * AG-UI run input with Hashbrown framework semantics.
 *
 * The extension travels in `forwardedProps.hashbrown`, AG-UI's extension
 * point for values an agent reads and intermediaries pass through untouched.
 * Clients before 0.8 sent it as a top-level `hashbrown` key; 0.8 sent both,
 * and that key is now gone.
 *
 * @internal
 */
export type HashbrownRunAgentInput = RunAgentInput & {
  forwardedProps?: { hashbrown?: HashbrownRunAgentExtension } & Record<
    string,
    unknown
  >;
};

/**
 * Reads the Hashbrown extension from a run input's `forwardedProps`.
 *
 * @internal
 */
export function readHashbrownExtension(
  input: HashbrownRunAgentInput,
): HashbrownRunAgentExtension | undefined {
  return input.forwardedProps?.hashbrown;
}

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
  /** Owned protocol responses for the initial resumed model run. */
  readonly resume?: readonly ResumeEntry[];
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
): HashbrownRunAgentExtension | undefined {
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
  resume,
}: CreateCanonicalRunAgentInputOptions): HashbrownRunAgentInput {
  const hashbrown = createHashbrownExtension(responseSchema, ui);

  return {
    threadId,
    runId,
    messages: messages as Message[],
    tools: tools.map(mapTool),
    context: [],
    state,
    forwardedProps: hashbrown ? { hashbrown } : {},
    ...(resume !== undefined
      ? {
          resume: resume.map(({ interruptId, status, payload, metadata }) => ({
            interruptId,
            status,
            ...(payload !== undefined ? { payload } : {}),
            ...(metadata !== undefined ? { metadata } : {}),
          })),
        }
      : {}),
  };
}
