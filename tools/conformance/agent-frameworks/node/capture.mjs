/**
 * Captures delivery-time JSON wire copies of producer events from an observable.
 *
 * @param observable - An observable accepting next, error and complete callbacks.
 * @param options - The bounded wait and optional synchronous delivery observer.
 * @returns Raw event snapshots in delivery order; stream errors and timeouts reject.
 * @remarks
 * The callback receives a separate copy so assertions cannot alter the evidence.
 * A protocol RUN_ERROR event remains evidence. Completion teardown failures reject;
 * if cleanup also fails after a stream, callback or timeout failure, the original
 * failure is retained.
 */
export function captureEvents(
  observable,
  { timeoutMs = 10_000, onEvent } = {},
) {
  return new Promise((resolve, reject) => {
    const events = [];
    let subscription;
    let settled = false;
    let unsubscribed = false;

    const unsubscribe = () => {
      if (subscription && !unsubscribed) {
        unsubscribed = true;
        subscription.unsubscribe();
      }
    };
    const settle = (error, failed = true) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Defer teardown until a synchronous subscribe has returned its subscription.
      queueMicrotask(() => {
        try {
          unsubscribe();
        } catch (cleanupError) {
          reject(failed ? error : cleanupError);
          return;
        }
        if (failed) reject(error);
        else resolve(events);
      });
    };
    const timer = setTimeout(() => {
      settle(new Error(`Event capture timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      subscription = observable.subscribe({
        next(event) {
          if (settled) return;
          try {
            const snapshot = JSON.parse(JSON.stringify(event));
            events.push(snapshot);
            onEvent?.(structuredClone(snapshot));
          } catch (error) {
            settle(error);
          }
        },
        error(error) {
          settle(error);
        },
        complete() {
          settle(undefined, false);
        },
      });
    } catch (error) {
      settle(error);
    }
  });
}

const eventIdFields = new Set([
  'threadId',
  'runId',
  'parentRunId',
  'messageId',
  'parentMessageId',
  'toolCallId',
  'parentToolCallId',
]);

/**
 * Projects raw AG-UI traces for reproducibility comparisons without changing them.
 *
 * @param events - Producer events in delivery order.
 * @param options - Explicit producer profile projection options. `mastraDelegation`
 * maps native delegation thread IDs; `mastraBackground` maps background task and
 * tool-call IDs and canonicalizes absolute activity timestamps by wire type.
 * @returns Copies with top-level timestamps omitted and known identities remapped.
 * @remarks
 * One first-appearance ID map preserves equality and distinctness across envelope
 * references and MESSAGES_SNAPSHOT message/tool-call identities. Arbitrary content,
 * state, custom values and other payloads remain verbatim, including their IDs and
 * timestamps. The explicit Mastra delegation profile additionally maps only the
 * native agent-worker result subAgentThreadId; it preserves all other payload fields.
 * The explicit Mastra background profile applies only to mastra-background-task
 * activity snapshots and deltas. It retains timestamp presence and type, but its
 * canonical timestamps do not represent elapsed duration; host gates verify timing.
 */
export function semanticProjection(
  events,
  { mastraDelegation = false, mastraBackground = false } = {},
) {
  const delegationCalls = new Set(
    mastraDelegation
      ? events
          .filter(
            (event) =>
              event.type === 'TOOL_CALL_START' &&
              event.toolCallName === 'agent-worker',
          )
          .map((event) => event.toolCallId)
      : [],
  );
  const ids = new Map();
  const remap = (value) => {
    if (typeof value !== 'string') return value;
    if (!ids.has(value)) ids.set(value, `id-${ids.size + 1}`);
    return ids.get(value);
  };
  const projectDelegation = (content) => {
    const result = JSON.parse(content);
    return JSON.stringify({
      ...result,
      subAgentThreadId: remap(result.subAgentThreadId),
    });
  };
  const projectAbsoluteTime = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return 0;
    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value))
    ) {
      return '1970-01-01T00:00:00.000Z';
    }
    return value;
  };
  const projectBackgroundContent = (content) =>
    content && typeof content === 'object' && !Array.isArray(content)
      ? Object.fromEntries(
          Object.entries(content).map(([key, value]) => [
            key,
            key === 'taskId' || key === 'toolCallId'
              ? remap(value)
              : key === 'startedAt' || key === 'completedAt'
                ? projectAbsoluteTime(value)
                : value,
          ]),
        )
      : content;
  const projectBackgroundPatch = (patch) =>
    Array.isArray(patch)
      ? patch.map((operation) =>
          operation &&
          (operation.path === '/startedAt' ||
            operation.path === '/completedAt') &&
          Object.hasOwn(operation, 'value')
            ? { ...operation, value: projectAbsoluteTime(operation.value) }
            : operation,
        )
      : patch;
  const projectMessage = (message) =>
    Object.fromEntries(
      Object.entries(message).map(([key, value]) => [
        key,
        key === 'id' || key === 'toolCallId'
          ? remap(value)
          : key === 'toolCalls' && Array.isArray(value)
            ? value.map((call) =>
                Object.fromEntries(
                  Object.entries(call).map(([field, content]) => [
                    field,
                    field === 'id' ? remap(content) : content,
                  ]),
                ),
              )
            : value,
      ]),
    );

  return structuredClone(events).map((event) =>
    Object.fromEntries(
      Object.entries(event)
        .filter(([key]) => key !== 'timestamp')
        .map(([key, value]) => [
          key,
          eventIdFields.has(key)
            ? remap(value)
            : mastraDelegation &&
                event.type === 'TOOL_CALL_RESULT' &&
                key === 'content' &&
                delegationCalls.has(event.toolCallId)
              ? projectDelegation(value)
              : mastraBackground &&
                  event.activityType === 'mastra-background-task' &&
                  event.type === 'ACTIVITY_SNAPSHOT' &&
                  key === 'content'
                ? projectBackgroundContent(value)
                : mastraBackground &&
                    event.activityType === 'mastra-background-task' &&
                    event.type === 'ACTIVITY_DELTA' &&
                    key === 'patch'
                  ? projectBackgroundPatch(value)
                  : event.type === 'MESSAGES_SNAPSHOT' &&
                      key === 'messages' &&
                      Array.isArray(value)
                    ? value.map(projectMessage)
                    : value,
        ]),
    ),
  );
}
