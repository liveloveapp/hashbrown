import type { Message } from '@ag-ui/core';
import type { ConversationRecoveryDiagnostic } from './conversation-recovery';
import { s } from '../schema';
import { resolveWithSchema } from '../utils';
import { ɵwithoutCancelledTurnProvenance } from './cancelled-turn';

const bindings = new WeakMap<
  Readonly<Message>,
  ConversationRecoveryDiagnostic
>();

/** Binds an explicitly accepted diagnostic to its owned canonical source. @internal */
export function bindHistoryDiagnostic(
  message: Readonly<Message>,
  threadId: string,
): void {
  if (message.role !== 'assistant' || typeof message.content !== 'string')
    return;
  bindings.set(
    message,
    Object.freeze({
      kind: 'unstructured-assistant-history',
      threadId,
      messageId: message.id,
      content: message.content,
    }),
  );
}

/** Reads only locally bound, still schema-invalid historical assistant text. @internal */
export function readHistoryDiagnostic(
  message: Readonly<Message>,
  schema?: s.HashbrownType,
): ConversationRecoveryDiagnostic | undefined {
  const diagnostic = bindings.get(message);
  return diagnostic &&
    schema &&
    resolveWithSchema(schema, diagnostic.content) === undefined
    ? diagnostic
    : undefined;
}

/** Preserves local bindings for complete unchanged sanitized native snapshot echoes. @internal */
export function restoreHistoryDiagnostics(
  previous: readonly Readonly<Message>[],
  incoming: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  for (const message of incoming) {
    const prior = previous.find((candidate) => candidate.id === message.id);
    const diagnostic = prior && bindings.get(prior);
    if (
      diagnostic &&
      sameJson(
        ɵwithoutCancelledTurnProvenance(prior),
        ɵwithoutCancelledTurnProvenance(message),
      )
    )
      bindings.set(message, diagnostic);
  }
  return incoming;
}

/** Compares complete owned JSON records independently of object key order. */
function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]))
    );
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]),
    )
  );
}

/** Retires local classification when its owning thread is explicitly replaced. @internal */
export function retireHistoryDiagnostics(
  messages: readonly Readonly<Message>[],
): void {
  for (const message of messages) bindings.delete(message);
}
