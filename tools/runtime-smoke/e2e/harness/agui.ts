import { type AGUIEvent, EventType } from '@ag-ui/core';
import type {
  AGUIMock,
  AGUIRunAgentInput,
  AGUIEvent as AimockAGUIEvent,
} from '@copilotkit/aimock/agui';
import type { TransportRequest } from '@hashbrownai/core';

const DEFAULT_TIMESTAMP = 1_700_000_000_000;

function createStreamSnapshottingEventArray(): AGUIEvent[] {
  const events: AGUIEvent[] = [];
  // Aimock holds this array by reference while delayed streams are active.
  Object.defineProperty(events, Symbol.iterator, {
    value: () => events.slice().values(),
  });
  return events;
}

/** AG-UI run input accepted by Hashbrown transports. */
export type HashbrownRunInput = NonNullable<TransportRequest['input']>;

/**
 * Registers request-aware AG-UI events and captures cloned matching inputs.
 */
export function registerRunFixture(
  aguiMock: Pick<AGUIMock, 'onPredicate'>,
  capturedInputs: HashbrownRunInput[],
  predicate: (input: HashbrownRunInput, requestIndex: number) => boolean,
  createEvents: (input: HashbrownRunInput, requestIndex: number) => AGUIEvent[],
  delayMs?: number,
): void {
  const events = createStreamSnapshottingEventArray();
  let requestIndex = 0;

  aguiMock.onPredicate(
    (input: AGUIRunAgentInput) => {
      const requestInput = input as HashbrownRunInput;
      if (!predicate(requestInput, requestIndex)) {
        return false;
      }

      capturedInputs.push(structuredClone(requestInput));
      events.splice(
        0,
        events.length,
        ...createEvents(requestInput, requestIndex),
      );
      requestIndex += 1;
      return true;
    },
    events as unknown as AimockAGUIEvent[],
    delayMs,
  );
}

/**
 * Creates a deterministic successful text run for the supplied request.
 */
export function createTextRunEvents(
  input: HashbrownRunInput,
  messageId: string,
  chunks: readonly string[],
  timestamp = DEFAULT_TIMESTAMP,
): AGUIEvent[] {
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: timestamp + 1,
    },
    ...chunks.map((delta, index): AGUIEvent => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
      timestamp: timestamp + index + 2,
    })),
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: timestamp + chunks.length + 2,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp: timestamp + chunks.length + 3,
    },
  ];
}

/**
 * Creates a deterministic failed run for the supplied request.
 */
export function createRunErrorEvents(
  input: HashbrownRunInput,
  message: string,
  timestamp = DEFAULT_TIMESTAMP,
): AGUIEvent[] {
  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp,
    },
    {
      type: EventType.RUN_ERROR,
      message,
      timestamp: timestamp + 1,
    },
  ];
}
