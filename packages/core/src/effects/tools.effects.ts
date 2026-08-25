import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectPendingToolCalls,
  selectThreadId,
  selectToolEntities,
  selectUnifiedError,
} from '../reducers';
import { s } from '../schema';

interface ActiveToolTurn {
  readonly toolCalls: Chat.Internal.ToolCall[];
  readonly controllers: Map<string, AbortController>;
  readonly threadId: string | undefined;
  settled: boolean;
}

function createCancellationError(): Error {
  const error = new Error('Tool execution cancelled');
  error.name = 'AbortError';
  return error;
}

function cancellationResults(
  toolCalls: Chat.Internal.ToolCall[],
): PromiseSettledResult<unknown>[] {
  return toolCalls.map(() => ({
    status: 'rejected',
    reason: createCancellationError(),
  }));
}

function toToolMessages(
  toolCalls: Chat.Internal.ToolCall[],
  results: PromiseSettledResult<unknown>[],
): Chat.Api.ToolMessage[] {
  return toolCalls.map((toolCall, index) => ({
    role: 'tool',
    content: results[index],
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  }));
}

async function executeToolCall(
  toolCall: Chat.Internal.ToolCall,
  tool: Chat.Internal.Tool | undefined,
  controller: AbortController,
): Promise<PromiseSettledResult<unknown>> {
  const signal = controller.signal;
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

export const runTools = createEffect((store) => {
  let activeTurn: ActiveToolTurn | undefined;

  const settleTurn = (
    turn: ActiveToolTurn,
    results: PromiseSettledResult<unknown>[],
    continuation: 'continue' | 'stop',
  ) => {
    if (turn.settled) {
      return;
    }

    turn.settled = true;
    if (activeTurn === turn) {
      activeTurn = undefined;
    }
    store.dispatch(
      internalActions.toolTurnSettled({
        toolCalls: turn.toolCalls,
        toolMessages: toToolMessages(turn.toolCalls, results),
        continuation,
      }),
    );
  };

  const cancelActiveTurn = () => {
    const turn = activeTurn;
    if (!turn || turn.settled) {
      return;
    }

    turn.controllers.forEach((controller) => controller.abort());
    settleTurn(turn, cancellationResults(turn.toolCalls), 'stop');
  };

  store.when(apiActions.assistantTurnFinalized, async (action) => {
    const unifiedError = store.read(selectUnifiedError);
    if (unifiedError || activeTurn) {
      return;
    }

    const pendingToolCalls = store.read(selectPendingToolCalls);
    const pendingById = new Map(
      pendingToolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );
    const toolCalls = action.payload.toolCalls.filter(
      (toolCall) => pendingById.get(toolCall.id) === toolCall,
    );
    const toolEntities = store.read(selectToolEntities);

    if (toolCalls.length === 0) {
      await Promise.resolve();
      store.dispatch(internalActions.skippedToolCalls());
      return;
    }

    if (action.payload.continuation === 'stop') {
      settleTurn(
        {
          toolCalls,
          controllers: new Map(),
          threadId: store.read(selectThreadId),
          settled: false,
        },
        cancellationResults(toolCalls),
        'stop',
      );
      return;
    }

    const executions = toolCalls.map((toolCall) => ({
      toolCall,
      controller: new AbortController(),
    }));
    const controllers = new Map(
      executions.map(({ toolCall, controller }) => [toolCall.id, controller]),
    );
    const turn: ActiveToolTurn = {
      toolCalls,
      controllers,
      threadId: store.read(selectThreadId),
      settled: false,
    };
    activeTurn = turn;

    const results = await Promise.all(
      executions.map(({ toolCall, controller }) =>
        executeToolCall(toolCall, toolEntities[toolCall.name], controller),
      ),
    );
    settleTurn(turn, results, 'continue');
  });

  store.when(
    devActions.stopMessageGeneration,
    devActions.sendMessage,
    devActions.setMessages,
    devActions.resendMessages,
    cancelActiveTurn,
  );

  store.when(devActions.updateOptions, (action) => {
    if (
      !Object.prototype.hasOwnProperty.call(action.payload, 'threadId') ||
      activeTurn?.threadId === action.payload.threadId
    ) {
      return;
    }

    cancelActiveTurn();
  });

  return cancelActiveTurn;
});
