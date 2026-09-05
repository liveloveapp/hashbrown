import { Chat } from '../models';
import type { LogicalRunOutcome } from './logical-run-coordinator';
import {
  createToolTurnCoordinator,
  type ToolTurnCoordinator,
  type ToolTurnOutcome,
} from './tool-turn-coordinator';

/**
 * Cancellation signals owned by an assistant turn and supplied to each model
 * run.
 *
 * @internal
 */
export interface AssistantTurnModelRunContext {
  readonly cancelSignal: AbortSignal;
  readonly retiredSignal: AbortSignal;
}

/**
 * Exact pending tool calls and tool definitions captured after a model run.
 *
 * @internal
 */
export interface AssistantTurnToolSnapshot {
  readonly toolTurnId?: string;
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
  readonly toolsByName: Readonly<
    Record<string, Chat.Internal.Tool | undefined>
  >;
}

/**
 * Callbacks used to execute one complete assistant turn without owning a store.
 *
 * @internal
 */
export interface CreateAssistantTurnCoordinatorOptions {
  readonly executeModelRun: (
    context: AssistantTurnModelRunContext,
  ) => Promise<LogicalRunOutcome>;
  readonly readToolSnapshot: () => AssistantTurnToolSnapshot;
  readonly toolTurnStarted?: (snapshot: AssistantTurnToolSnapshot) => void;
  readonly settleToolTurn: (
    toolCalls: readonly Chat.Internal.ToolCall[],
    outcome: ToolTurnOutcome,
    toolTurnId?: string,
  ) => void;
  readonly reportNoTools: () => void;
}

/**
 * Handle for observing, cancelling, or retiring one complete assistant turn.
 *
 * @internal
 */
export interface AssistantTurnCoordinator {
  readonly completion: Promise<LogicalRunOutcome>;
  readonly cancel: () => void;
  readonly retire: () => void;
}

interface ActiveToolTurn {
  readonly coordinator: ToolTurnCoordinator;
  readonly snapshot: AssistantTurnToolSnapshot;
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
  settled: boolean;
}

/**
 * Coordinates iterative model and tool phases for one assistant turn.
 *
 * @internal
 */
export function createAssistantTurnCoordinator({
  executeModelRun,
  readToolSnapshot,
  toolTurnStarted,
  settleToolTurn,
  reportNoTools,
}: CreateAssistantTurnCoordinatorOptions): AssistantTurnCoordinator {
  const cancelController = new AbortController();
  const retiredController = new AbortController();
  let activeToolTurn: ActiveToolTurn | undefined;

  const settleSnapshot = (
    snapshot: AssistantTurnToolSnapshot,
    toolCalls: readonly Chat.Internal.ToolCall[],
    outcome: ToolTurnOutcome,
  ) => {
    if (snapshot.toolTurnId === undefined) {
      settleToolTurn(toolCalls, outcome);
    } else {
      settleToolTurn(toolCalls, outcome, snapshot.toolTurnId);
    }
  };

  const settleActiveToolTurn = (
    turn: ActiveToolTurn,
    outcome: ToolTurnOutcome,
  ) => {
    if (turn.settled) {
      return;
    }

    turn.settled = true;
    if (activeToolTurn === turn) {
      activeToolTurn = undefined;
    }
    settleSnapshot(turn.snapshot, turn.toolCalls, outcome);
  };

  const interruptActiveToolTurn = () => {
    const turn = activeToolTurn;
    if (!turn || turn.settled) {
      return;
    }

    const outcome =
      turn.coordinator.cancel() ?? createStoppedToolTurnOutcome(turn.toolCalls);
    settleActiveToolTurn(turn, outcome);
  };

  const completion = executeAssistantTurn({
    executeModelRun,
    readToolSnapshot,
    toolTurnStarted,
    settleClaimedToolSnapshot: (snapshot, outcome) =>
      settleSnapshot(snapshot, snapshot.toolCalls, outcome),
    settleActiveToolTurn,
    reportNoTools,
    cancelSignal: cancelController.signal,
    retiredSignal: retiredController.signal,
    setActiveToolTurn: (turn) => {
      activeToolTurn = turn;
    },
  });

  return {
    completion,
    cancel: () => {
      cancelController.abort();
      interruptActiveToolTurn();
    },
    retire: () => {
      retiredController.abort();
      interruptActiveToolTurn();
    },
  };
}

interface ExecuteAssistantTurnOptions {
  readonly executeModelRun: (
    context: AssistantTurnModelRunContext,
  ) => Promise<LogicalRunOutcome>;
  readonly readToolSnapshot: () => AssistantTurnToolSnapshot;
  readonly toolTurnStarted?: (snapshot: AssistantTurnToolSnapshot) => void;
  readonly settleClaimedToolSnapshot: (
    snapshot: AssistantTurnToolSnapshot,
    outcome: ToolTurnOutcome,
  ) => void;
  readonly settleActiveToolTurn: (
    turn: ActiveToolTurn,
    outcome: ToolTurnOutcome,
  ) => void;
  readonly reportNoTools: () => void;
  readonly cancelSignal: AbortSignal;
  readonly retiredSignal: AbortSignal;
  readonly setActiveToolTurn: (turn: ActiveToolTurn) => void;
}

async function executeAssistantTurn({
  executeModelRun,
  readToolSnapshot,
  toolTurnStarted,
  settleClaimedToolSnapshot,
  settleActiveToolTurn,
  reportNoTools,
  cancelSignal,
  retiredSignal,
  setActiveToolTurn,
}: ExecuteAssistantTurnOptions): Promise<LogicalRunOutcome> {
  while (true) {
    const interruption = getInterruption(retiredSignal, cancelSignal);
    if (interruption) {
      return interruption;
    }

    const modelOutcome = await executeModelRun({
      cancelSignal,
      retiredSignal,
    });
    const interruptionAfterModel = getInterruption(retiredSignal, cancelSignal);
    if (interruptionAfterModel) {
      return interruptionAfterModel;
    }
    if (modelOutcome.kind !== 'finished') {
      return modelOutcome;
    }

    const snapshot = readToolSnapshot();
    const toolCalls = [...snapshot.toolCalls];
    const interruptionAfterSnapshot = getInterruption(
      retiredSignal,
      cancelSignal,
    );
    if (interruptionAfterSnapshot) {
      return interruptionAfterSnapshot;
    }
    if (toolCalls.length === 0) {
      reportNoTools();
      return getInterruption(retiredSignal, cancelSignal) ?? modelOutcome;
    }

    toolTurnStarted?.(snapshot);
    const interruptionAfterClaim = getInterruption(retiredSignal, cancelSignal);
    if (interruptionAfterClaim) {
      settleClaimedToolSnapshot(
        snapshot,
        createStoppedToolTurnOutcome(toolCalls),
      );
      return interruptionAfterClaim;
    }

    const toolCoordinator = createToolTurnCoordinator({
      toolCalls,
      toolsByName: snapshot.toolsByName,
    });
    const turn: ActiveToolTurn = {
      coordinator: toolCoordinator,
      snapshot,
      toolCalls,
      settled: false,
    };
    setActiveToolTurn(turn);
    const toolOutcome = await toolCoordinator.completion.then((outcome) => {
      settleActiveToolTurn(turn, outcome);
      return outcome;
    });
    const interruptionAfterTools = getInterruption(retiredSignal, cancelSignal);
    if (interruptionAfterTools) {
      return interruptionAfterTools;
    }
    if (toolOutcome.continuation === 'stop') {
      return { kind: 'cancelled' };
    }
  }
}

function createStoppedToolTurnOutcome(
  toolCalls: readonly Chat.Internal.ToolCall[],
): ToolTurnOutcome {
  return {
    continuation: 'stop',
    results: toolCalls.map(() => ({
      status: 'rejected',
      reason: createToolCancellationError(),
    })),
  };
}

function createToolCancellationError(): Error {
  const error = new Error('Tool execution cancelled');
  error.name = 'AbortError';
  return error;
}

function getInterruption(
  retiredSignal: AbortSignal,
  cancelSignal: AbortSignal,
): Extract<LogicalRunOutcome, { kind: 'retired' | 'cancelled' }> | undefined {
  if (retiredSignal.aborted) {
    return { kind: 'retired' };
  }
  if (cancelSignal.aborted) {
    return { kind: 'cancelled' };
  }

  return undefined;
}
