import { markColdRecoveryRequest } from '../transport/recovery-request-policy';
import type { Message, ToolMessage } from '@ag-ui/core';
import { Chat } from '../models';
import { s } from '../schema';
import type {
  BrowserRecoveryCheckpoint,
  ResumeCheckpoint,
} from '../reducers/resume-checkpoint';
import type { JsonValue } from '../utils/types';
import {
  createCanonicalRunAgentInput,
  type HashbrownRunAgentInput,
} from '../transport/hashbrown-run-agent-input';
import type {
  ConversationRecoveryDiagnostic,
  PendingBrowserRecovery,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
} from '../models/conversation-recovery';
import type {
  Interrupt,
  PendingInterruptBatch,
  ResumeEntry,
} from '../models/interrupt';
import { assertInterruptsNotExpired } from '../transport/interrupt-validation';

/** Validates a negotiated capability against canonical unresolved browser calls. @internal */
export function ownPendingBrowserRecovery(
  capability: PendingBrowserRecovery | undefined,
  toolCalls: PendingConversationRecovery['toolCalls'],
  interrupts: readonly Interrupt[],
  createId: () => string,
): PendingConversationRecovery | undefined {
  if (capability === undefined) {
    if (toolCalls.length)
      throw new TypeError(
        'Recovery contains an unresolved executable browser tool call.',
      );
    return undefined;
  }

  if (!capability || typeof capability !== 'object')
    throw new TypeError('Invalid pending browser recovery capability.');
  const descriptors = Object.getOwnPropertyDescriptors(capability);
  if (
    Reflect.ownKeys(capability).length !== 3 ||
    !['protocolVersion', 'serverRevision', 'callIds'].every(
      (key) => descriptors[key]?.enumerable && 'value' in descriptors[key],
    )
  )
    throw new TypeError('Invalid pending browser recovery capability.');
  const version: unknown = descriptors['protocolVersion'].value;
  const revision: unknown = descriptors['serverRevision'].value;
  const ids: unknown = descriptors['callIds'].value;
  if (
    version !== 1 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length !== toolCalls.length ||
    Reflect.ownKeys(ids).length !== ids.length + 1
  )
    throw new TypeError('Invalid pending browser recovery capability.');
  const ownedIds = new Set<string>();
  for (let index = 0; index < ids.length; index++) {
    const item = Object.getOwnPropertyDescriptor(ids, String(index));
    if (
      !item ||
      !item.enumerable ||
      !('value' in item) ||
      typeof item.value !== 'string' ||
      item.value.trim().length === 0 ||
      new TextEncoder().encode(item.value).byteLength > 1024 ||
      ownedIds.has(item.value)
    )
      throw new TypeError('Invalid pending browser recovery call IDs.');
    ownedIds.add(item.value);
  }
  if (toolCalls.some((call) => !ownedIds.has(call.id)))
    throw new TypeError('Pending browser recovery does not match history.');
  if (
    interrupts.some(
      (interrupt) =>
        interrupt.toolCallId !== undefined &&
        ownedIds.has(interrupt.toolCallId),
    )
  )
    throw new TypeError(
      'Browser recovery calls cannot also require protected decisions.',
    );

  return Object.freeze({
    id: createId(),
    serverRevision: revision,
    toolCalls: Object.freeze([...toolCalls]),
    interrupts,
  });
}

/** Reserved canonical observation of a result whose external effect is unknown. @internal */
export const browserResultUnavailableContent =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';

/** Reads durable uncertainty only from an exact canonical result of a browser call. @internal */
export function readBrowserRecoveryDiagnostic(
  message: Readonly<Message>,
  threadId: string | undefined,
  browserCallIds: ReadonlySet<string>,
):
  | Extract<
      ConversationRecoveryDiagnostic,
      { kind: 'browser-result-unavailable' }
    >
  | undefined {
  if (
    threadId === undefined ||
    message.role !== 'tool' ||
    message.content !== browserResultUnavailableContent ||
    !browserCallIds.has(message.toolCallId)
  )
    return undefined;
  return Object.freeze({
    kind: 'browser-result-unavailable',
    threadId,
    messageId: message.id,
    toolCallId: message.toolCallId,
    content: message.content,
  });
}

/** Clones strict JSON through data descriptors without reading accessors. @internal */
export function cloneRecoveryJsonValue(value: unknown): JsonValue {
  const ancestors = new Set<object>();
  const clone = (input: unknown, depth: number): JsonValue => {
    if (depth > 64) throw new TypeError('Recovery JSON exceeds depth 64.');
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean'
    )
      return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null || ancestors.has(input))
      throw new TypeError('Invalid recovery JSON value.');
    ancestors.add(input);
    try {
      const keys = Reflect.ownKeys(input);
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype)
          throw new TypeError('Recovery JSON requires ordinary arrays.');
        if (keys.length !== input.length + 1)
          throw new TypeError(
            'Recovery arrays must contain only dense JSON values.',
          );
        const output: JsonValue[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(
            input,
            String(index),
          );
          if (!descriptor?.enumerable || !('value' in descriptor))
            throw new TypeError(
              'Recovery arrays must contain only data properties.',
            );
          output.push(clone(descriptor.value, depth + 1));
        }
        return Object.freeze(output) as unknown as JsonValue;
      }
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('Recovery JSON requires plain objects.');
      const output = Object.create(null) as Record<string, JsonValue>;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (
          typeof key !== 'string' ||
          !descriptor?.enumerable ||
          !('value' in descriptor)
        )
          throw new TypeError(
            'Recovery JSON requires enumerable string data properties.',
          );
        Object.defineProperty(output, key, {
          value: clone(descriptor.value, depth + 1),
          enumerable: true,
        });
      }
      return Object.freeze(output);
    } finally {
      ancestors.delete(input);
    }
  };
  return clone(value, 0);
}

/** Reads only permitted own data fields without invoking settlement accessors. @internal */
function dataFields(
  value: unknown,
  allowed: readonly string[],
): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid browser recovery settlement.');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !allowed.includes(key) ||
        !fields[key].enumerable ||
        !('value' in fields[key]),
    )
  )
    throw new TypeError('Invalid browser recovery settlement fields.');
  return fields;
}

/** Owns only the complete genuine protected decisions; browser IDs never create approvals. @internal */
function ownProtectedRecoveryEntries(
  pending: PendingConversationRecovery,
  entries: unknown,
  nativeBatch: PendingInterruptBatch | undefined,
): readonly ResumeEntry[] | undefined {
  if (!pending.interrupts.length) {
    if (
      nativeBatch !== undefined ||
      (entries !== undefined &&
        (!Array.isArray(entries) ||
          Object.getPrototypeOf(entries) !== Array.prototype ||
          entries.length !== 0 ||
          Reflect.ownKeys(entries).length !== 1))
    )
      throw new TypeError(
        'Browser-only recovery cannot include protected decisions.',
      );
    return undefined;
  }
  if (!nativeBatch || nativeBatch.interrupts !== pending.interrupts)
    throw new Error('Stale protected recovery batch.');
  assertInterruptsNotExpired(nativeBatch.interrupts, Date.now());
  if (
    !Array.isArray(entries) ||
    Object.getPrototypeOf(entries) !== Array.prototype ||
    entries.length !== pending.interrupts.length ||
    Reflect.ownKeys(entries).length !== entries.length + 1
  )
    throw new TypeError(
      'Every protected interrupt requires exactly one decision.',
    );
  const remaining = new Set(
    pending.interrupts.map((interrupt) => interrupt.id),
  );
  const owned = new Map<string, ResumeEntry>();
  for (let index = 0; index < entries.length; index++) {
    const item = Object.getOwnPropertyDescriptor(entries, String(index));
    if (!item?.enumerable || !('value' in item))
      throw new TypeError('Invalid protected recovery responses.');
    const fields = dataFields(item.value, [
      'interruptId',
      'status',
      'payload',
      'metadata',
    ]);
    const id: unknown = fields['interruptId']?.value;
    const status: unknown = fields['status']?.value;
    const payload: unknown = fields['payload']?.value;
    const metadata: unknown = fields['metadata']?.value;
    if (
      typeof id !== 'string' ||
      !remaining.delete(id) ||
      (status !== 'resolved' && status !== 'cancelled') ||
      (status === 'cancelled' && payload !== undefined)
    )
      throw new TypeError(
        'Invalid protected recovery response identity or status.',
      );
    if (
      metadata !== undefined &&
      (metadata === null ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata))
    )
      throw new TypeError('Protected response metadata must be a JSON object.');
    owned.set(
      id,
      Object.freeze({
        interruptId: id,
        status,
        ...(payload !== undefined
          ? { payload: cloneRecoveryJsonValue(payload) }
          : {}),
        ...(metadata !== undefined
          ? {
              metadata: cloneRecoveryJsonValue(metadata) as Readonly<
                Record<string, unknown>
              >,
            }
          : {}),
      }),
    );
  }
  return Object.freeze(
    pending.interrupts.map((interrupt) => {
      const entry = owned.get(interrupt.id);
      if (!entry) throw new TypeError('Missing protected recovery decision.');
      return entry;
    }),
  );
}

const checkpointOwners = new WeakMap<
  BrowserRecoveryCheckpoint,
  PendingConversationRecovery
>();

/** Verifies that a checkpoint was fully prepared for this exact local epoch. @internal */
export function ownsBrowserRecoveryCheckpoint(
  checkpoint: BrowserRecoveryCheckpoint,
  pending: PendingConversationRecovery,
): boolean {
  return checkpointOwners.get(checkpoint) === pending;
}

/** Prepares the complete immutable request before any local submission claim. @internal */
export function createBrowserRecoveryCheckpoint(
  pending: PendingConversationRecovery,
  options: ResumeConversationRecoveryOptions,
  base: ResumeCheckpoint,
  canonicalMessages: readonly Readonly<Message>[],
  threadId: string,
  createId: () => string,
  nativeBatch?: PendingInterruptBatch,
): BrowserRecoveryCheckpoint {
  const fields = dataFields(options, ['batchId', 'outcomes', 'entries']);
  if (fields['batchId']?.value !== pending.id)
    throw new Error('Stale browser recovery batch.');
  const outcomes: unknown = fields['outcomes']?.value;
  if (
    !Array.isArray(outcomes) ||
    outcomes.length !== pending.toolCalls.length ||
    Reflect.ownKeys(outcomes).length !== outcomes.length + 1
  )
    throw new TypeError(
      'Every pending browser call requires exactly one outcome.',
    );
  const entries = ownProtectedRecoveryEntries(
    pending,
    fields['entries']?.value,
    nativeBatch,
  );
  const contents = new Map<
    string,
    { readonly content: string; readonly status: 'result' | 'unavailable' }
  >();
  for (let index = 0; index < outcomes.length; index++) {
    const item = Object.getOwnPropertyDescriptor(outcomes, String(index));
    if (!item?.enumerable || !('value' in item))
      throw new TypeError('Invalid recovery outcomes.');
    const outcome = dataFields(item.value, ['toolCallId', 'status', 'value']);
    const id: unknown = outcome['toolCallId']?.value;
    const status: unknown = outcome['status']?.value;
    if (
      typeof id !== 'string' ||
      !pending.toolCalls.some((call) => call.id === id) ||
      contents.has(id)
    )
      throw new TypeError('Invalid browser recovery outcome identity.');
    if (status === 'unavailable' && !Object.hasOwn(outcome, 'value')) {
      contents.set(id, { content: browserResultUnavailableContent, status });
    } else if (status === 'result' && Object.hasOwn(outcome, 'value')) {
      const value = cloneRecoveryJsonValue(outcome['value'].value);
      contents.set(id, {
        content: typeof value === 'string' ? value : JSON.stringify(value),
        status,
      });
    } else throw new TypeError('Invalid browser recovery outcome.');
  }
  const ids = new Set(
    base.messages.flatMap((message) => [
      message.id,
      ...(message.role === 'assistant'
        ? (message.toolCalls ?? []).map((call) => call.id)
        : []),
    ]),
  );
  const freshId = () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      const id = createId();
      if (id.trim() && !ids.has(id)) {
        ids.add(id);
        return id;
      }
    }
    throw new Error('Cannot allocate a unique recovery message identity.');
  };
  const orderedOutcomes = pending.toolCalls.map((call) => {
    const outcome = contents.get(call.id);
    if (!outcome) throw new TypeError('Missing browser recovery outcome.');
    return { call, outcome };
  });
  const results: readonly Readonly<ToolMessage>[] = Object.freeze(
    orderedOutcomes.map(({ call, outcome }) =>
      Object.freeze({
        id: freshId(),
        role: 'tool' as const,
        toolCallId: call.id,
        content: outcome.content,
      }),
    ),
  );
  const messages = Object.freeze([...base.messages, ...results]);
  const input = createCanonicalRunAgentInput({
    threadId,
    runId: freshId(),
    messages,
    state: base.state,
    tools: Chat.helpers.toApiToolsFromInternal(base.internalTools),
    responseSchema: base.requestResponseSchema
      ? s.toJsonSchema(base.requestResponseSchema)
      : undefined,
    ui: base.uiRequested,
    resume: entries,
    recovery: {
      version: 1,
      serverRevision: pending.serverRevision,
      outcomes: orderedOutcomes.map(({ call, outcome }) => ({
        toolCallId: call.id,
        status: outcome.status,
      })),
    },
  });
  // Capture the actual JSON wire representation, including its final run identity.
  const serialized = JSON.stringify(input);
  if (new TextEncoder().encode(serialized).byteLength > 1024 * 1024)
    throw new TypeError(
      'Browser recovery request exceeds the local byte limit.',
    );
  const request = cloneRecoveryJsonValue(
    JSON.parse(serialized),
  ) as unknown as HashbrownRunAgentInput;
  markColdRecoveryRequest(request);
  const checkpoint: BrowserRecoveryCheckpoint = Object.freeze({
    ...base,
    messages,
    request,
    nativeBatch,
    canonicalMessages: Object.freeze([...canonicalMessages, ...results]),
  });
  checkpointOwners.set(checkpoint, pending);
  return checkpoint;
}
