import assert from 'node:assert/strict';
import type {
  CandidateHandlerObserver,
  CandidateObserverBinding,
  CandidateObserverEntry,
  CandidateObserverScope,
} from './candidate-handler-observer';

/** Positive initial invocation identity and the subsequent canonical binding observation. */
export interface CandidateObserverBaseline {
  readonly initialEntries: readonly CandidateObserverEntry[];
  readonly boundEntries: readonly CandidateObserverEntry[];
  readonly attemptSequences: readonly number[];
}

/** Retains the original positive witness and validates canonical enrichment without changing invocation identities. */
export async function bindCandidateObserverBaseline(
  observer: CandidateHandlerObserver,
  scope: CandidateObserverScope,
  bindings: readonly CandidateObserverBinding[],
): Promise<CandidateObserverBaseline> {
  const initialEntries = observer.entries(scope);
  const attempts = () =>
    observer
      .records()
      .filter(
        (record) =>
          record.kind === 'request-received' &&
          record.scenarioId === scope.scenarioId &&
          record.threadId === scope.threadId,
      )
      .map((record) => record.seq);
  const attemptSequences = attempts();
  await observer.bindCanonical(scope, bindings);
  const boundEntries = observer.entries(scope);
  assert.equal(
    boundEntries.length,
    initialEntries.length,
    'Observer entry cardinality changed during binding',
  );
  for (const [index, entry] of boundEntries.entries()) {
    const binding = bindings.find(
      (value) => value.correlation === entry.correlation,
    );
    assert.ok(binding, 'Observer entry lacks a trusted canonical binding');
    assert.equal(
      entry.canonicalCallId,
      binding.canonicalCallId,
      'Observer canonical binding differs',
    );
    const invocationIdentity = (value: CandidateObserverEntry) =>
      Object.fromEntries(
        Object.entries(value).filter(([field]) => field !== 'canonicalCallId'),
      );
    assert.deepEqual(
      invocationIdentity(entry),
      invocationIdentity(initialEntries[index]),
      'Observer invocation changed during canonical binding',
    );
  }
  assert.deepEqual(
    attempts(),
    attemptSequences,
    'Observer received attempts changed during binding',
  );
  return { initialEntries, boundEntries, attemptSequences };
}

/** Requires unchanged observed invocation and received-attempt identities against the selected baseline. */
export function assertCandidateObserverUnchanged(
  observer: CandidateHandlerObserver,
  scope: CandidateObserverScope,
  baseline: CandidateObserverBaseline,
): void {
  assert.deepEqual(
    observer.entries(scope),
    baseline.boundEntries,
    'Candidate observer entries changed',
  );
  assert.deepEqual(
    observer
      .records()
      .filter(
        (record) =>
          record.kind === 'request-received' &&
          record.scenarioId === scope.scenarioId &&
          record.threadId === scope.threadId,
      )
      .map((record) => record.seq),
    baseline.attemptSequences,
    'Candidate observer attempts changed',
  );
}

/** Independently expected browser content for one original canonical tool call. */
export interface CandidateExpectedBrowserOutcome {
  readonly toolCallId: string;
  readonly status: 'result' | 'unavailable';
  readonly content: string;
}

/** Independently validates the exact browser-only submitted prefix, result suffix, metadata and saved result identities. */
export function assertCandidateContinuation(
  prefix: readonly Record<string, unknown>[],
  outcomes: readonly CandidateExpectedBrowserOutcome[],
  revision: number,
  input: Record<string, unknown>,
  savedMessages: readonly Record<string, unknown>[],
): void {
  assertContinuationWithDecisions(
    prefix,
    outcomes,
    revision,
    input,
    savedMessages,
  );
}

/** Checks the same actual captured canonical domain with a separately explicit expected protected-decision set. */
function assertContinuationWithDecisions(
  prefix: readonly Record<string, unknown>[],
  outcomes: readonly CandidateExpectedBrowserOutcome[],
  revision: number,
  input: Record<string, unknown>,
  savedMessages: readonly Record<string, unknown>[],
  decisions?: readonly CandidateExpectedProtectedDecision[],
): void {
  assert.ok(
    Number.isSafeInteger(revision) && revision > 0,
    'Positive actual recovery revision required',
  );
  assert.ok(
    outcomes.length > 0 &&
      new Set(outcomes.map((outcome) => outcome.toolCallId)).size ===
        outcomes.length,
    'Unique original browser outcomes required',
  );
  assert.ok(
    Array.isArray(input.messages),
    'Captured continuation messages required',
  );
  const messages = input.messages as Record<string, unknown>[];
  assert.equal(
    messages.length,
    prefix.length + outcomes.length,
    'Captured continuation suffix message length differs',
  );
  assert.deepEqual(
    messages.slice(0, prefix.length),
    prefix,
    'Captured continuation prefix changed',
  );
  assert.deepEqual(
    savedMessages.slice(0, prefix.length),
    prefix,
    'Saved canonical prefix changed',
  );
  const wanted = new Set(outcomes.map((outcome) => outcome.toolCallId));
  const announced = prefix
    .flatMap((message) =>
      Array.isArray(message.toolCalls)
        ? (message.toolCalls as Record<string, unknown>[])
        : [],
    )
    .filter((call) => wanted.has(String(call.id)))
    .map((call) => call.id);
  assert.deepEqual(
    announced,
    outcomes.map((outcome) => outcome.toolCallId),
    'Original browser outcome order differs from canonical announcements',
  );
  const used = new Set(prefix.map((message) => message.id));
  const suffix = messages.slice(prefix.length);
  for (const [index, outcome] of outcomes.entries()) {
    const message = suffix[index];
    assert.ok(
      typeof message.id === 'string' &&
        message.id.length > 0 &&
        !used.has(message.id),
      'Browser result requires a fresh unique message identity',
    );
    used.add(message.id);
    assert.deepEqual(
      message,
      {
        id: message.id,
        role: 'tool',
        toolCallId: outcome.toolCallId,
        content: outcome.content,
      },
      'Captured browser result message differs',
    );
    const persisted = savedMessages.filter(
      (item) => item.role === 'tool' && item.toolCallId === outcome.toolCallId,
    );
    assert.equal(
      persisted.length,
      1,
      'Saved browser result cardinality differs',
    );
    assert.deepEqual(
      persisted[0],
      message,
      'Saved browser result identity/content differs from submitted result',
    );
  }
  const forwarded = input.forwardedProps;
  assert.ok(
    record(forwarded) && record(forwarded.hashbrown),
    'Captured recovery metadata required',
  );
  assert.deepEqual(
    forwarded.hashbrown.recovery,
    {
      version: 1,
      serverRevision: revision,
      outcomes: outcomes.map((outcome) => ({
        toolCallId: outcome.toolCallId,
        status: outcome.status,
      })),
    },
    'Captured recovery revision/outcomes/fields differ',
  );
  if (decisions === undefined) {
    assert.ok(
      input.resume === undefined ||
        (Array.isArray(input.resume) && input.resume.length === 0),
      'Browser-only pilot cannot submit protected resume entries',
    );
  } else
    assert.deepEqual(
      input.resume,
      decisions,
      'Actual protected resume decisions differ from the complete genuine expected batch',
    );
}

/** Checks structured extension locations in actual public/config/opaque domains without searching user text. */
export function assertCandidatePersistedRecoveryAbsent(
  value: Readonly<{
    publicRequest: unknown;
    configuration: unknown;
    nativeJson: string;
  }>,
): void {
  assert.equal(
    typeof value.nativeJson,
    'string',
    'Actual persisted opaque native JSON required',
  );
  const opaque: unknown = JSON.parse(value.nativeJson);
  const inspect = (
    current: unknown,
    seen: Set<object>,
    domain: string,
  ): void => {
    if (current === null || typeof current !== 'object' || seen.has(current))
      return;
    seen.add(current);
    if (
      record(current) &&
      record(current.forwardedProps) &&
      record(current.forwardedProps.hashbrown)
    )
      assert.ok(
        !Object.hasOwn(current.forwardedProps.hashbrown, 'recovery'),
        `Transient recovery extension persisted in ${domain}`,
      );
    for (const child of Object.values(current)) inspect(child, seen, domain);
  };
  inspect(value.publicRequest, new Set(), 'public request');
  inspect(value.configuration, new Set(), 'configuration');
  inspect(opaque, new Set(), 'opaque native state');
}

/** Narrows parsed JSON objects without interpreting strings as structured metadata. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One independently expected genuine protected decision, copied from the actual pending interrupt batch. */
export interface CandidateExpectedProtectedDecision {
  readonly interruptId: string;
  readonly status: 'resolved' | 'cancelled';
  readonly payload?: Readonly<{ approved: boolean }>;
}

/** Requires the complete explicit genuine protected decisions without weakening browser-only continuation validation. */
export function assertCandidateMixedContinuation(
  prefix: readonly Record<string, unknown>[],
  outcomes: readonly CandidateExpectedBrowserOutcome[],
  revision: number,
  decisions: readonly CandidateExpectedProtectedDecision[],
  input: Record<string, unknown>,
  savedMessages: readonly Record<string, unknown>[],
): void {
  assert.ok(
    decisions.length > 0,
    'Explicit genuine protected decisions required',
  );
  assert.equal(
    new Set(decisions.map((decision) => decision.interruptId)).size,
    decisions.length,
    'Duplicate genuine protected interrupt decisions',
  );
  for (const decision of decisions) {
    assert.ok(
      typeof decision.interruptId === 'string' &&
        decision.interruptId.length > 0 &&
        !outcomes.some(
          (outcome) => outcome.toolCallId === decision.interruptId,
        ),
      'Genuine protected interrupt identity required',
    );
    if (decision.status === 'cancelled')
      assert.deepEqual(
        decision,
        { interruptId: decision.interruptId, status: 'cancelled' },
        'Cancelled protected decision cannot forge a payload',
      );
    else {
      assert.equal(
        decision.status,
        'resolved',
        'Unknown protected decision status',
      );
      assert.ok(
        typeof decision.payload?.approved === 'boolean',
        'Explicit protected approval decision required',
      );
      assert.deepEqual(
        decision,
        {
          interruptId: decision.interruptId,
          status: 'resolved',
          payload: { approved: decision.payload.approved },
        },
        'Protected decision contains unsupported fields',
      );
    }
  }
  assertContinuationWithDecisions(
    prefix,
    outcomes,
    revision,
    input,
    savedMessages,
    decisions,
  );
}
