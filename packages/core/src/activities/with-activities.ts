import {
  type AGUIEvent,
  EventType,
  type JsonPatchOperation,
} from '@ag-ui/core';

/**
 * Updates one activity created by {@link ActivityWriter.snapshot}.
 *
 * @typeParam T - The shape of the activity's content.
 * @public
 */
export interface ActivityHandle<T> {
  /**
   * Sends `ACTIVITY_DELTA` with the given RFC 6902 operations.
   *
   * @param operations - The JSON Patch operations to apply to the content.
   */
  patch(operations: readonly JsonPatchOperation[]): void;
  /**
   * Sends `ACTIVITY_SNAPSHOT` (`replace: true`) with new content.
   *
   * @param content - The activity's new content.
   */
  replace(content: T): void;
}

/**
 * Sends AG-UI activity events into a provider run.
 *
 * Writes throw once the run has closed, and are silent no-ops after the run
 * is aborted.
 *
 * @public
 */
export interface ActivityWriter {
  /**
   * Creates or replaces an activity. Sends `ACTIVITY_SNAPSHOT`
   * (`replace: true`).
   *
   * @param messageId - The activity message's id. It must be unique within
   * the thread: reusing an id sent in an earlier run updates that earlier
   * activity in place. Derive it from the run (for example
   * `` `plan-${input.runId}` ``) to give each run its own activity.
   * @param activityType - The kind of activity. A later snapshot for the same
   * id must use the same type.
   * @param content - The activity's content.
   * @returns A handle for patching or replacing the activity.
   */
  snapshot<T extends Record<string, unknown>>(
    messageId: string,
    activityType: string,
    content: T,
  ): ActivityHandle<T>;
}

/**
 * What a provider's `activities` callback receives.
 *
 * @public
 */
export interface ActivityContext {
  /** Sends AG-UI activity events into this run. */
  readonly activity: ActivityWriter;
  /**
   * Resolves when the model stream ends (before `RUN_FINISHED` is sent).
   * Rejects if the model call fails, or with an `AbortError` when the run is
   * aborted.
   */
  readonly model: Promise<void>;
  /** The run's abort signal. */
  readonly signal: AbortSignal;
}

/**
 * A provider option that sends activity events alongside the model's output.
 * The run's terminal event waits until the returned promise settles, and a
 * thrown error ends the run with `RUN_ERROR`.
 *
 * @public
 */
export type ActivityCallback = (
  context: ActivityContext,
) => Promise<void> | void;

type QueueItem =
  { readonly done: false; readonly value: AGUIEvent } | { readonly done: true };

/**
 * A minimal unbounded async queue: pushes never block, and `next` waits for
 * the next item. Items pushed after `end` are dropped.
 */
function createEventQueue() {
  const items: QueueItem[] = [];
  let waiting: ((item: QueueItem) => void) | undefined;
  let ended = false;

  const deliver = (item: QueueItem) => {
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve(item);
    } else {
      items.push(item);
    }
  };

  return {
    push(value: AGUIEvent) {
      if (!ended) {
        deliver({ done: false, value });
      }
    },
    end() {
      if (!ended) {
        ended = true;
        deliver({ done: true });
      }
    },
    next(): Promise<QueueItem> {
      const item = items.shift();
      if (item) {
        return Promise.resolve(item);
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
  };
}

function createAbortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTerminal(event: AGUIEvent): boolean {
  return (
    event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR
  );
}

/**
 * Runs a provider's event stream together with an `activities` callback.
 *
 * Without a callback it returns `createEvents(signal)` unchanged. With one,
 * it passes an owned, linked abort signal to `createEvents`, starts the
 * callback right after the provider's `RUN_STARTED`, merges both sources in
 * arrival order, and holds the provider's `RUN_FINISHED` or `RUN_ERROR` until
 * the callback settles.
 *
 * @param createEvents - Creates the provider's AG-UI event stream.
 * @param activities - The caller's activity callback, if any.
 * @param signal - The caller's abort signal, if any.
 * @returns The merged AG-UI event stream.
 * @internal
 */
export function ɵwithActivities(
  createEvents: (signal: AbortSignal | undefined) => AsyncIterable<AGUIEvent>,
  activities: ActivityCallback | undefined,
  signal: AbortSignal | undefined,
): AsyncIterable<AGUIEvent> {
  if (!activities) {
    return createEvents(signal);
  }
  return runWithActivities(createEvents, activities, signal);
}

async function* runWithActivities(
  createEvents: (signal: AbortSignal | undefined) => AsyncIterable<AGUIEvent>,
  activities: ActivityCallback,
  signal: AbortSignal | undefined,
): AsyncIterable<AGUIEvent> {
  const controller = new AbortController();
  const queue = createEventQueue();
  const activityTypes = new Map<string, string>();

  let resolveModel!: () => void;
  let rejectModel!: (reason: unknown) => void;
  const model = new Promise<void>((resolve, reject) => {
    resolveModel = resolve;
    rejectModel = reject;
  });
  // The callback may never observe `model`; its rejection is not an error.
  model.catch(() => undefined);

  let cancelled = false;
  let consumerStopped = false;
  let closed = false;
  let callbackStarted = false;
  let callbackSettled = false;
  let callbackError: string | undefined;
  let modelEnded = false;
  let providerDone = false;
  let heldTerminal: AGUIEvent | undefined;

  const close = (terminal: AGUIEvent | undefined) => {
    if (closed) {
      return;
    }
    if (terminal && !cancelled) {
      queue.push(terminal);
    }
    closed = true;
    queue.end();
  };

  const cancel = () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    rejectModel(createAbortError());
    controller.abort(signal?.reason);
    finishIfReady();
  };

  function finishIfReady() {
    if (!providerDone) {
      return;
    }
    if (cancelled) {
      // Every write is a no-op and no terminal is sent, so there is nothing
      // to wait for: end without waiting for the callback.
      close(undefined);
      return;
    }
    if (callbackStarted && !callbackSettled) {
      return;
    }
    if (
      callbackError !== undefined &&
      heldTerminal?.type !== EventType.RUN_ERROR
    ) {
      // A held RUN_ERROR wins: it is the model's failure, which the callback
      // usually rethrows by awaiting `model`.
      close({ type: EventType.RUN_ERROR, message: callbackError });
      return;
    }
    close(heldTerminal);
  }

  const write = (event: AGUIEvent): boolean => {
    if (cancelled) {
      return false;
    }
    if (closed) {
      throw new Error(
        `Cannot send ${event.type} for activity after the run has closed.`,
      );
    }
    queue.push(event);
    return true;
  };

  const writer: ActivityWriter = {
    snapshot<T extends Record<string, unknown>>(
      messageId: string,
      activityType: string,
      content: T,
    ): ActivityHandle<T> {
      const existing = activityTypes.get(messageId);
      if (
        !cancelled &&
        !closed &&
        existing !== undefined &&
        existing !== activityType
      ) {
        throw new Error(
          `Activity "${messageId}" already has activityType "${existing}"; ` +
            `cannot send a snapshot with activityType "${activityType}".`,
        );
      }
      const sendSnapshot = (next: T) =>
        write({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType,
          content: structuredClone(next),
          replace: true,
        });
      if (sendSnapshot(content)) {
        activityTypes.set(messageId, activityType);
      }
      return {
        patch(operations) {
          if (!cancelled && !closed && !activityTypes.has(messageId)) {
            throw new Error(
              `Cannot patch activity "${messageId}" before its snapshot is sent.`,
            );
          }
          write({
            type: EventType.ACTIVITY_DELTA,
            messageId,
            activityType,
            patch: structuredClone([...operations]),
          });
        },
        replace(next) {
          sendSnapshot(next);
        },
      };
    },
  };

  const startCallback = () => {
    callbackStarted = true;
    new Promise<void>((resolve) =>
      resolve(
        activities({ activity: writer, model, signal: controller.signal }),
      ),
    ).then(
      () => {
        callbackSettled = true;
        finishIfReady();
      },
      (error: unknown) => {
        callbackSettled = true;
        if (!modelEnded && !cancelled) {
          // The model is still streaming: stop it and end the run now.
          callbackError = errorMessage(error);
          rejectModel(createAbortError());
          controller.abort();
          close({ type: EventType.RUN_ERROR, message: callbackError });
          return;
        }
        callbackError = errorMessage(error);
        finishIfReady();
      },
    );
  };

  const endModel = (terminal: AGUIEvent | undefined) => {
    if (modelEnded) {
      return;
    }
    modelEnded = true;
    heldTerminal = terminal;
    if (cancelled || controller.signal.aborted) {
      rejectModel(createAbortError());
    } else if (terminal?.type === EventType.RUN_ERROR) {
      rejectModel(new Error(terminal.message));
    } else {
      resolveModel();
    }
  };

  const pump = async () => {
    try {
      // Breaking out of `for await` calls the provider iterator's `return()`.
      for await (const event of createEvents(controller.signal)) {
        // After a caller abort the provider stops on its own, and what it
        // yields until then is forwarded as it is today. Once the run has
        // closed or nobody is reading, stop pulling.
        if (closed || consumerStopped) {
          break;
        }
        if (isTerminal(event)) {
          // Settle `model` before awaiting the provider's `return()`, so a
          // callback settling in that gap sees the model as ended.
          endModel(event);
          break;
        }
        queue.push(event);
        if (
          event.type === EventType.RUN_STARTED &&
          !callbackStarted &&
          !cancelled
        ) {
          startCallback();
        }
      }
    } catch (error: unknown) {
      if (!cancelled && !controller.signal.aborted) {
        endModel({ type: EventType.RUN_ERROR, message: errorMessage(error) });
      }
    }
    endModel(undefined);
    providerDone = true;
    finishIfReady();
  };

  if (signal?.aborted) {
    cancel();
  } else {
    signal?.addEventListener('abort', cancel, { once: true });
  }

  void pump();

  try {
    for (;;) {
      const item = await queue.next();
      if (item.done) {
        return;
      }
      yield item.value;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!closed) {
      // The consumer stopped early: treat it as an abort.
      consumerStopped = true;
      cancel();
    }
  }
}
