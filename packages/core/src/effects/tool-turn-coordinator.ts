import { Chat } from '../models';
import { executeToolTurn } from './tool-turn-executor';

/**
 * Inputs for one cancellable tool turn.
 *
 * @internal
 */
export interface CreateToolTurnCoordinatorOptions {
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
  readonly toolsByName: Readonly<
    Record<string, Chat.Internal.Tool | undefined>
  >;
}

/**
 * Settled result of one tool turn.
 *
 * @internal
 */
export interface ToolTurnOutcome {
  readonly results: readonly PromiseSettledResult<unknown>[];
  readonly continuation: 'continue' | 'stop';
}

/**
 * Handle for observing or cancelling one active tool turn.
 *
 * @internal
 */
export interface ToolTurnCoordinator {
  readonly completion: Promise<ToolTurnOutcome>;
  readonly cancel: () => ToolTurnOutcome | undefined;
}

/**
 * Starts one tool turn and coordinates its cancellation and terminal outcome.
 *
 * @internal
 */
export function createToolTurnCoordinator({
  toolCalls,
  toolsByName,
}: CreateToolTurnCoordinatorOptions): ToolTurnCoordinator {
  const calls = [...toolCalls];
  const executions = calls.map((toolCall) => ({
    toolCall,
    tool: toolsByName[toolCall.name],
    controller: new AbortController(),
  }));
  let settledOutcome: ToolTurnOutcome | undefined;

  const completion = executeToolTurn(
    executions.map(({ toolCall, tool, controller }) => ({
      toolCall,
      tool,
      signal: controller.signal,
    })),
  ).then((results) => {
    if (settledOutcome) {
      return settledOutcome;
    }

    settledOutcome = { results, continuation: 'continue' };
    return settledOutcome;
  });

  return {
    completion,
    cancel: () => {
      if (settledOutcome) {
        return undefined;
      }

      settledOutcome = {
        results: cancellationResults(calls),
        continuation: 'stop',
      };
      executions.forEach(({ controller }) => controller.abort());
      return settledOutcome;
    },
  };
}

function cancellationResults(
  toolCalls: readonly Chat.Internal.ToolCall[],
): PromiseSettledResult<unknown>[] {
  return toolCalls.map(() => ({
    status: 'rejected',
    reason: createCancellationError(),
  }));
}

function createCancellationError(): Error {
  const error = new Error('Tool execution cancelled');
  error.name = 'AbortError';
  return error;
}
