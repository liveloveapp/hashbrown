import { createEffect } from '../utils/micro-ngrx';
import { apiActions, devActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectPendingToolCalls,
  selectThreadId,
  selectToolEntities,
  selectUnifiedError,
} from '../reducers';
import {
  createToolTurnCoordinator,
  type ToolTurnCoordinator,
  type ToolTurnOutcome,
} from './tool-turn-coordinator';

interface ActiveToolTurn {
  readonly toolCalls: Chat.Internal.ToolCall[];
  readonly coordinator: ToolTurnCoordinator;
  readonly threadId: string | undefined;
  settled: boolean;
}

function toToolMessages(
  toolCalls: Chat.Internal.ToolCall[],
  results: readonly PromiseSettledResult<unknown>[],
): Chat.Api.ToolMessage[] {
  return toolCalls.map((toolCall, index) => ({
    role: 'tool',
    content: results[index],
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  }));
}

export const runTools = createEffect((store) => {
  let activeTurn: ActiveToolTurn | undefined;

  const settleTurn = (turn: ActiveToolTurn, outcome: ToolTurnOutcome) => {
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
        toolMessages: toToolMessages(turn.toolCalls, outcome.results),
        continuation: outcome.continuation,
      }),
    );
  };

  const cancelActiveTurn = () => {
    const turn = activeTurn;
    if (!turn || turn.settled) {
      return;
    }

    const outcome = turn.coordinator.cancel();
    if (outcome) {
      settleTurn(turn, outcome);
    }
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

    const coordinator = createToolTurnCoordinator({
      toolCalls,
      toolsByName: toolEntities,
    });
    const turn: ActiveToolTurn = {
      toolCalls,
      coordinator,
      threadId: store.read(selectThreadId),
      settled: false,
    };
    activeTurn = turn;

    if (action.payload.continuation === 'stop') {
      const outcome = coordinator.cancel();
      if (outcome) {
        settleTurn(turn, outcome);
      }
      return;
    }

    const outcome = await coordinator.completion;
    settleTurn(turn, outcome);
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
