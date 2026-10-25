import type { AssistantMessage, Message } from '@ag-ui/core';

/** Reserved provenance for a runtime-owned cancellation record. @internal */
export const ɵCANCELLED_TURN_METADATA_KEY = 'hashbrown.runtimeCancellation';

/** Creates an immutable factual record for one cancelled generation. @internal */
export function ɵcreateCancelledTurnMarker(
  id: string,
  generationId: string,
  reason: 'stopped' | 'superseded',
): Readonly<AssistantMessage> {
  return Object.freeze({
    id,
    role: 'assistant',
    content:
      reason === 'stopped'
        ? '[Hashbrown runtime: The user cancelled this request before completion. Do not continue it unless the user asks again.]'
        : '[Hashbrown runtime: This request was cancelled because the user replaced it with a new request. Do not continue it unless the user asks again.]',
    metadata: Object.freeze({
      [ɵCANCELLED_TURN_METADATA_KEY]: Object.freeze({
        v: 1,
        generationId,
        reason,
      }),
    }),
  });
}

/** Identifies a plain-text runtime cancellation record by reserved provenance. @internal */
export function ɵisCancelledTurnMarker(message: Readonly<Message>): boolean {
  if (
    message.role !== 'assistant' ||
    typeof message.content !== 'string' ||
    message.toolCalls !== undefined
  )
    return false;
  const provenance = message.metadata?.[ɵCANCELLED_TURN_METADATA_KEY];
  if (typeof provenance !== 'object' || provenance === null) return false;
  const record = provenance as Record<string, unknown>;
  return (
    record['v'] === 1 &&
    typeof record['generationId'] === 'string' &&
    (record['reason'] === 'stopped' || record['reason'] === 'superseded')
  );
}

/** Removes only private cancellation provenance at the shared request boundary. @internal */
export function ɵwithoutCancelledTurnProvenance(
  message: Readonly<Message>,
): Readonly<Message> {
  if (
    !message.metadata ||
    !Object.hasOwn(message.metadata, ɵCANCELLED_TURN_METADATA_KEY)
  )
    return message;
  const metadata = Object.fromEntries(
    Object.entries(message.metadata).filter(
      ([key]) => key !== ɵCANCELLED_TURN_METADATA_KEY,
    ),
  );
  const rest = Object.fromEntries(
    Object.entries(message).filter(([key]) => key !== 'metadata'),
  );
  return Object.keys(metadata).length
    ? (Object.freeze({
        ...rest,
        metadata: Object.freeze(metadata),
      }) as Readonly<Message>)
    : (Object.freeze(rest) as Readonly<Message>);
}

/** Restores owned provenance only for exact plain-text snapshot echoes. @internal */
export function ɵrestoreCancelledTurnProvenance(
  previous: readonly Readonly<Message>[],
  incoming: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  const owned = new Map(
    previous
      .filter(ɵisCancelledTurnMarker)
      .map((message) => [message.id, message]),
  );
  return Object.freeze(
    incoming.map((message) => {
      const prior = owned.get(message.id);
      const clean = ɵwithoutCancelledTurnProvenance(message);
      return prior &&
        message.role === 'assistant' &&
        message.toolCalls === undefined &&
        message.content === prior.content
        ? (Object.freeze({
            ...clean,
            metadata: Object.freeze({
              ...clean.metadata,
              [ɵCANCELLED_TURN_METADATA_KEY]:
                prior.metadata?.[ɵCANCELLED_TURN_METADATA_KEY],
            }),
          }) as Readonly<Message>)
        : clean;
    }),
  );
}
