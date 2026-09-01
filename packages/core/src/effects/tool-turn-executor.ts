import { Chat } from '../models';
import { s } from '../schema';

/**
 * Describes one tool call that is ready for execution.
 *
 * @internal
 */
export interface ToolCallExecution {
  readonly toolCall: Chat.Internal.ToolCall;
  readonly tool: Chat.Internal.Tool | undefined;
  readonly signal: AbortSignal;
}

function createCancellationError(): Error {
  const error = new Error('Tool execution cancelled');
  error.name = 'AbortError';
  return error;
}

async function executeToolCall(
  executionInput: ToolCallExecution,
): Promise<PromiseSettledResult<unknown>> {
  const { toolCall, tool, signal } = executionInput;
  if (signal.aborted) {
    return { status: 'rejected', reason: createCancellationError() };
  }

  const execution = Promise.resolve().then(async () => {
    try {
      if (signal.aborted) {
        throw createCancellationError();
      }

      if (!tool) {
        throw new Error(`Tool ${toolCall.name} not found`);
      }

      let args: unknown = toolCall.arguments;
      if (typeof args === 'string') {
        args = JSON.parse(args);
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            // Keep the original string if it isn't valid JSON.
          }
        }
      }

      if (s.isHashbrownType(tool.schema)) {
        tool.schema.validate(args);
      }

      const value = await tool.handler(args, signal);
      return { status: 'fulfilled', value } as const;
    } catch (reason) {
      return { status: 'rejected', reason } as const;
    }
  });

  let onAbort = () => undefined;
  const cancellation = new Promise<PromiseSettledResult<unknown>>((resolve) => {
    onAbort = () => {
      resolve({ status: 'rejected', reason: createCancellationError() });
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([execution, cancellation]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Executes a batch of tool calls concurrently and returns their settled
 * results in input order.
 *
 * @internal
 */
export function executeToolTurn(
  executions: readonly ToolCallExecution[],
): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.all(executions.map((execution) => executeToolCall(execution)));
}
