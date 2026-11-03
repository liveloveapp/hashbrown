import type {
  ConversationRecoveryConfiguration,
  ConversationSnapshot,
  JsonValue,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
  ResumeEntry,
} from '@hashbrownai/core';

/** Candidate-only V2 lookup data; the actual runtime retains canonical restore authority. */
export interface CandidateRecoveryEnvelope {
  readonly schemaVersion: 2;
  readonly disposition: string;
  readonly serverRevision: number;
  readonly snapshot?: ConversationSnapshot;
  readonly reason?: string;
}

/** Raw visible editor choices, before complete-set validation. */
export interface CandidateRecoveryForm {
  readonly outcomes: readonly {
    readonly toolCallId: string;
    readonly status: string;
    readonly json?: string;
  }[];
  readonly decisions: readonly {
    readonly interruptId: string;
    readonly decision: string;
  }[];
}

/** Local read context captured before asynchronous lookup; never server authority. */
export interface CandidateReadTicket {
  readonly threadId: string;
  readonly revision: number;
}

/** Local asynchronous response guard, independent of server revision admission. */
export interface CandidateReadGuard {
  begin(threadId: string, revision: number): CandidateReadTicket;
  isCurrent(
    ticket: CandidateReadTicket,
    threadId: string,
    revision: number,
  ): boolean;
  invalidate(): void;
}

/** Narrows an ordinary parsed object without invoking application callbacks. */
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Checks the structural snapshot boundary; actual restore independently validates canonical history. */
function snapshot(value: unknown): value is ConversationSnapshot {
  return (
    object(value) &&
    typeof value.threadId === 'string' &&
    value.threadId.length > 0 &&
    Array.isArray(value.messages) &&
    value.messages.every(
      (message: unknown) =>
        object(message) &&
        typeof message.id === 'string' &&
        message.id.length > 0 &&
        ['system', 'user', 'assistant', 'tool'].includes(
          String(message.role),
        ) &&
        (message.role !== 'tool' ||
          (typeof message.toolCallId === 'string' &&
            typeof message.content === 'string')),
    ) &&
    (value.configuredSystemMessageId === undefined ||
      typeof value.configuredSystemMessageId === 'string') &&
    (value.interrupts === undefined ||
      (Array.isArray(value.interrupts) &&
        value.interrupts.every(
          (interrupt: unknown) =>
            object(interrupt) &&
            typeof interrupt.id === 'string' &&
            interrupt.id.length > 0 &&
            typeof interrupt.reason === 'string' &&
            (interrupt.toolCallId === undefined ||
              typeof interrupt.toolCallId === 'string'),
        )))
  );
}

/** Copies only actual JSON-parsed values into the public JSON domain. */
function jsonValue(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
  maximumDepth = 64,
): JsonValue {
  if (depth > maximumDepth) throw new Error('Known JSON depth exceeded');
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (
    !value ||
    typeof value !== 'object' ||
    ancestors.has(value) ||
    Object.getOwnPropertySymbols(value).length
  )
    throw new Error('Known JSON value required');
  const prototype = Object.getPrototypeOf(value);
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  )
    throw new Error('Plain JSON data required');
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).length !== value.length + 1)
        throw new Error('Dense JSON array required');
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new Error('Dense JSON data required');
        result.push(
          jsonValue(descriptor.value, ancestors, depth + 1, maximumDepth),
        );
      }
      return result;
    }
    return Object.fromEntries(
      Object.entries(descriptors).map(([key, descriptor]) => {
        if (!descriptor.enumerable || !('value' in descriptor))
          throw new Error('JSON data property required');
        return [
          key,
          jsonValue(descriptor.value, ancestors, depth + 1, maximumDepth),
        ];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Reads actual V2 envelope fields without creating capability or canonical data. */
export function parseCandidateRecoveryEnvelope(
  value: unknown,
  threadId: string,
  browserToolNames: readonly string[],
): CandidateRecoveryEnvelope {
  // Envelope nesting adds transport metadata around state; runtime validates canonical value limits separately.
  const owned = jsonValue(value, new Set<object>(), 0, 128);
  if (
    !object(owned) ||
    owned.schemaVersion !== 2 ||
    typeof owned.disposition !== 'string' ||
    ![
      'Pending',
      'Completed',
      'Busy',
      'UnknownEffect',
      'Expired',
      'Unavailable',
      'FailedBeforeEffect',
      'NativePendingBrowserResults',
    ].includes(owned.disposition) ||
    !Number.isSafeInteger(owned.serverRevision) ||
    typeof owned.serverRevision !== 'number' ||
    owned.serverRevision <= 0 ||
    Object.keys(owned).some(
      (key) =>
        ![
          'schemaVersion',
          'disposition',
          'serverRevision',
          'snapshot',
          'reason',
        ].includes(key),
    ) ||
    (owned.reason != null && typeof owned.reason !== 'string')
  )
    throw new Error('Unsupported recovery envelope');
  const retained = owned.snapshot == null ? undefined : owned.snapshot;
  if (
    retained !== undefined &&
    (!snapshot(retained) || retained.threadId !== threadId)
  )
    throw new Error('Recovery snapshot does not match the current thread');
  const restored = snapshot(retained) ? retained : undefined;
  if (!['Pending', 'Completed'].includes(owned.disposition) && restored)
    throw new Error('Blocked recovery cannot expose a snapshot');
  const capability = restored?.pendingBrowserRecovery;
  if (owned.disposition === 'Pending') {
    if (
      !restored ||
      !object(capability) ||
      Object.keys(capability).sort().join(',') !==
        'callIds,protocolVersion,serverRevision' ||
      capability.protocolVersion !== 1 ||
      capability.serverRevision !== owned.serverRevision ||
      !Array.isArray(capability.callIds) ||
      capability.callIds.length === 0 ||
      capability.callIds.some(
        (id: unknown) => typeof id !== 'string' || id.length === 0,
      ) ||
      new Set(capability.callIds).size !== capability.callIds.length
    )
      throw new Error('Complete V2 browser recovery capability required');
    const protectedIds = new Set(
      (restored.interrupts ?? []).map((interrupt) => interrupt.toolCallId),
    );
    const settled = new Set(
      restored.messages
        .filter((message) => message.role === 'tool')
        .map((message) => message.toolCallId),
    );
    const expected: string[] = [];
    const announced = new Set<string>();
    for (const message of restored.messages) {
      if (message.role !== 'assistant') continue;
      for (const call of message.toolCalls ?? []) {
        if (
          !object(call) ||
          call.type !== 'function' ||
          typeof call.id !== 'string' ||
          !call.id ||
          !object(call.function) ||
          typeof call.function.name !== 'string' ||
          typeof call.function.arguments !== 'string' ||
          announced.has(call.id)
        )
          throw new Error('Invalid canonical recovery calls');
        announced.add(call.id);
        if (
          browserToolNames.includes(call.function.name) &&
          !settled.has(call.id) &&
          !protectedIds.has(call.id)
        )
          expected.push(call.id);
      }
    }
    if (
      expected.length !== capability.callIds.length ||
      expected.some((id, index) => id !== capability.callIds[index])
    )
      throw new Error(
        'Capability must identify every original unresolved browser call',
      );
  } else if (capability !== undefined) {
    throw new Error('Only pending recovery may advertise browser settlement');
  }
  return {
    schemaVersion: owned.schemaVersion,
    disposition: owned.disposition,
    serverRevision: owned.serverRevision,
    ...(restored ? { snapshot: restored } : {}),
    ...(typeof owned.reason === 'string' ? { reason: owned.reason } : {}),
  };
}

/** Converts actual explicit visible choices into the existing public settlement command. */
export function buildCandidateRecoveryOptions(
  pending: PendingConversationRecovery,
  form: CandidateRecoveryForm,
): ResumeConversationRecoveryOptions {
  const browserIds = new Set(pending.toolCalls.map((call) => call.id));
  const interruptIds = new Set(
    pending.interrupts.map((interrupt) => interrupt.id),
  );
  if (
    !pending.id ||
    browserIds.size !== pending.toolCalls.length ||
    interruptIds.size !== pending.interrupts.length
  )
    throw new Error('Current complete pending recovery batch required');
  const choices = new Map<string, CandidateRecoveryForm['outcomes'][number]>();
  for (const choice of form.outcomes) {
    if (!browserIds.has(choice.toolCallId) || choices.has(choice.toolCallId))
      throw new Error('Duplicate or foreign browser outcome');
    choices.set(choice.toolCallId, choice);
  }
  const decisions = new Map<
    string,
    CandidateRecoveryForm['decisions'][number]
  >();
  for (const choice of form.decisions) {
    if (
      !interruptIds.has(choice.interruptId) ||
      decisions.has(choice.interruptId)
    )
      throw new Error('Duplicate or foreign genuine decision');
    decisions.set(choice.interruptId, choice);
  }
  if (choices.size !== browserIds.size || decisions.size !== interruptIds.size)
    throw new Error('Every browser outcome and genuine decision is required');
  const outcomes = pending.toolCalls.map((call) => {
    const choice = choices.get(call.id);
    if (!choice) throw new Error('Missing browser outcome');
    if (choice.status === 'unavailable')
      return { toolCallId: choice.toolCallId, status: 'unavailable' as const };
    if (choice.status !== 'result' || typeof choice.json !== 'string')
      throw new Error('Explicit known or unavailable outcome required');
    return {
      toolCallId: choice.toolCallId,
      status: 'result' as const,
      value: jsonValue(JSON.parse(choice.json)),
    };
  });
  const entries: ResumeEntry[] = pending.interrupts.map((interrupt) => {
    const choice = decisions.get(interrupt.id);
    if (!choice) throw new Error('Missing genuine decision');
    if (choice.decision === 'cancel')
      return { interruptId: choice.interruptId, status: 'cancelled' };
    if (choice.decision !== 'approve' && choice.decision !== 'decline')
      throw new Error('Explicit genuine decision required');
    return {
      interruptId: choice.interruptId,
      status: 'resolved',
      payload: { approved: choice.decision === 'approve' },
    };
  });
  return {
    batchId: pending.id,
    outcomes,
    ...(entries.length ? { entries } : {}),
  };
}

/** Builds the existing authenticated lookup with unchanged trusted configuration bytes. */
export function buildCandidateRecoveryRead(
  context: Readonly<{ endpoint: string; threadId: string; principal: string }>,
  configuration: ConversationRecoveryConfiguration,
): Readonly<{ url: string; init: RequestInit }> {
  const endpoint = new URL(context.endpoint);
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    !endpoint.port ||
    endpoint.origin !== context.endpoint ||
    !context.threadId ||
    !context.principal
  )
    throw new Error('Owned recovery origin, thread and principal required');
  return {
    url: `${context.endpoint}/threads/${encodeURIComponent(context.threadId)}/native-session`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': context.principal,
        'Hashbrown-Recovery-Version': '2',
      },
      body: JSON.stringify(configuration),
    },
  };
}

/** Captures local read identity without storing snapshots or pending execution authority. */
export function createCandidateReadGuard(): CandidateReadGuard {
  let current: CandidateReadTicket | undefined;
  return {
    begin: (threadId, revision) => {
      if (!threadId || !Number.isSafeInteger(revision) || revision < 0)
        throw new Error('Valid captured local revision and thread required');
      current = Object.freeze({ threadId, revision });
      return current;
    },
    isCurrent: (ticket, threadId, revision) =>
      ticket === current &&
      ticket.threadId === threadId &&
      ticket.revision === revision,
    invalidate() {
      current = undefined;
    },
  };
}
