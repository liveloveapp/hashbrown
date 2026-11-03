import { ɵwithoutCancelledTurnProvenance } from '../models/cancelled-turn';
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
  /** Request-local explicit cold settlement evidence; values remain in tool messages. */
  recovery?: {
    readonly version: 1;
    readonly serverRevision: number;
    readonly outcomes: readonly {
      readonly toolCallId: string;
      readonly status: 'result' | 'unavailable';
    }[];
  };
}

/**
 * AG-UI run input with Hashbrown framework semantics.
 *
 * The extension travels in `forwardedProps.hashbrown`, AG-UI's extension
 * point for values an agent reads and intermediaries pass through untouched.
 * Clients before 0.8 sent it as a top-level `hashbrown` key, which servers
 * no longer read.
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
  readonly recovery?: HashbrownRunAgentExtension['recovery'];
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
 * Removes client activity records and reserved cancellation provenance from
 * outgoing history while retaining factual cancellation text. Returns the same
 * array when no message needs to change.
 */
function prepareOutgoingMessages(
  messages: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  const clean = messages.map(ɵwithoutCancelledTurnProvenance);
  if (clean.some((message, index) => message !== messages[index]))
    messages = clean;
  return messages.some((message) => message.role === 'activity')
    ? messages.filter((message) => message.role !== 'activity')
    : messages;
}

/**
 * Creates an AG-UI run input from an already-owned canonical checkpoint.
 * Activity messages and private cancellation provenance are stripped.
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
  recovery,
}: CreateCanonicalRunAgentInputOptions): HashbrownRunAgentInput {
  const base = createHashbrownExtension(responseSchema, ui);
  const hashbrown = recovery ? { ...base, recovery } : base;

  return {
    threadId,
    runId,
    messages: prepareOutgoingMessages(messages) as Message[],
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
