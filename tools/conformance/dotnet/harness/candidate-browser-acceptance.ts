import assert from 'node:assert/strict';

/** Native provider API selected by an actual legal composition. */
export type CandidateAcceptanceApi = 'chat-completions' | 'responses';
/** Parsed owned JSON object; strings are never interpreted as authority. */
export function candidateAcceptanceObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
type HistoryAtom =
  | Readonly<{ kind: 'text'; role: string; text: string }>
  | Readonly<{ kind: 'call' | 'result'; id: string }>;

/** Checks ordered native roles/text and call/result positions without reading tool outputs or nested metadata as text. */
export function assertCandidateProviderTextHistory(
  body: Record<string, unknown>,
  api: CandidateAcceptanceApi,
  prefix: readonly Record<string, unknown>[],
): void {
  const expected: HistoryAtom[] = [];
  for (const message of prefix) {
    if (
      ['user', 'assistant', 'system'].includes(String(message.role)) &&
      typeof message.content === 'string' &&
      message.content.length > 0
    )
      expected.push({
        kind: 'text',
        role: String(message.role),
        text: message.content,
      });
    if (Array.isArray(message.toolCalls))
      for (const call of message.toolCalls) {
        assert.ok(
          candidateAcceptanceObject(call) && typeof call.id === 'string',
          'Original history call identity missing',
        );
        expected.push(
          { kind: 'call', id: call.id },
          { kind: 'result', id: call.id },
        );
      }
  }
  const history = body[api === 'responses' ? 'input' : 'messages'];
  assert.ok(Array.isArray(history), 'Provider history array required');
  const actual: HistoryAtom[] = [];
  const identity = (id: unknown): string => {
    assert.ok(
      typeof id === 'string' && id.length > 0,
      'Provider history call identity required',
    );
    return id;
  };
  for (const item of history) {
    assert.ok(
      candidateAcceptanceObject(item),
      'Provider history item required',
    );
    if (api === 'responses' && item.type === 'function_call') {
      actual.push({ kind: 'call', id: identity(item.call_id) });
      continue;
    }
    if (api === 'responses' && item.type === 'function_call_output') {
      actual.push({ kind: 'result', id: identity(item.call_id) });
      continue;
    }
    if (api === 'chat-completions' && item.role === 'tool') {
      actual.push({ kind: 'result', id: identity(item.tool_call_id) });
      continue;
    }
    assert.ok(
      ['system', 'user', 'assistant'].includes(String(item.role)),
      'Unexpected provider history text role',
    );
    if (api === 'responses')
      assert.ok(
        item.type === undefined || item.type === 'message',
        'Unexpected provider history item type',
      );
    let text = '';
    if (typeof item.content === 'string') text = item.content;
    else if (Array.isArray(item.content))
      for (const part of item.content) {
        assert.ok(
          candidateAcceptanceObject(part),
          'Provider history text part required',
        );
        const allowed: 'output_text' | 'input_text' | 'text' =
          api === 'responses'
            ? item.role === 'assistant'
              ? 'output_text'
              : 'input_text'
            : 'text';
        assert.equal(
          part.type,
          allowed,
          'Unexpected provider history text part type',
        );
        assert.ok(
          typeof part.text === 'string',
          'Provider history text missing',
        );
        text += part.text;
      }
    else
      assert.ok(
        item.content === undefined || item.content === null,
        'Unsupported provider history content',
      );
    assert.ok(
      text.length > 0 ||
        (api === 'chat-completions' &&
          Array.isArray(item.tool_calls) &&
          item.tool_calls.length > 0),
      'Unexpected empty provider history message',
    );
    if (text.length)
      actual.push({ kind: 'text', role: String(item.role), text });
    if (api === 'chat-completions' && item.tool_calls !== undefined) {
      assert.equal(
        item.role,
        'assistant',
        'Provider call must retain assistant role',
      );
      assert.ok(Array.isArray(item.tool_calls));
      for (const call of item.tool_calls) {
        assert.ok(candidateAcceptanceObject(call));
        actual.push({ kind: 'call', id: identity(call.id) });
      }
    }
  }
  assert.deepEqual(
    actual,
    expected,
    'Provider history ordered role/text/call prefix differs',
  );
}

/** Requires the retained strict schema on every actual provider phase owned by a structured or UI facade. */
export function assertCandidateFacadeSchema(
  facade: string,
  api: CandidateAcceptanceApi,
  configuration: Record<string, unknown>,
  providers: readonly Record<string, unknown>[],
): void {
  const required = [
    'structured-chat',
    'structured-completion',
    'ui-chat',
    'ui-completion',
  ].includes(facade);
  const forwarded = configuration.forwardedProps;
  const schema =
    candidateAcceptanceObject(forwarded) &&
    candidateAcceptanceObject(forwarded.hashbrown)
      ? forwarded.hashbrown.responseSchema
      : undefined;
  if (required) {
    assert.ok(
      candidateAcceptanceObject(schema),
      'Required facade response schema missing from actual configuration',
    );
    assert.equal(
      schema.type,
      'object',
      'Required facade schema must be an object',
    );
    assert.ok(
      candidateAcceptanceObject(schema.properties),
      'Required facade schema properties missing',
    );
    assert.equal(
      schema.additionalProperties,
      false,
      'Required facade schema must be strict',
    );
    assert.ok(
      Array.isArray(schema.required),
      'Required facade schema fields missing',
    );
  }
  assert.ok(providers.length > 0, 'Actual provider schema phases required');
  for (const body of providers) {
    if (schema === undefined) {
      assert.ok(
        !Object.hasOwn(body, 'response_format'),
        'Unexpected unconfigured provider schema',
      );
      assert.ok(
        !candidateAcceptanceObject(body.text) ||
          !Object.hasOwn(body.text, 'format'),
        'Unexpected unconfigured provider schema',
      );
      continue;
    }
    if (api === 'responses') {
      assert.deepEqual(
        body.text,
        {
          format: {
            type: 'json_schema',
            name: 'hashbrown',
            schema,
            strict: true,
          },
        },
        'Provider schema format differs',
      );
      assert.ok(
        !Object.hasOwn(body, 'response_format'),
        'Wrong API schema field',
      );
    } else {
      assert.deepEqual(
        body.response_format,
        {
          type: 'json_schema',
          json_schema: { name: 'hashbrown', schema, strict: true },
        },
        'Provider schema format differs',
      );
      assert.ok(
        !candidateAcceptanceObject(body.text) ||
          !Object.hasOwn(body.text, 'format'),
        'Wrong API schema field',
      );
    }
  }
}
/** Completes the owner then explicitly reconciles the previously blocked reader, retaining failures in either phase. */
export async function reconcileCandidateBusyReader(
  completeOwner: () => Promise<unknown>,
  readBlockedReader: () => Promise<unknown>,
): Promise<void> {
  await completeOwner();
  await readBlockedReader();
}
/** Requires the one fixture-only browserBindings removal and the actual corrupt-journal HTTP503 contract. */
export function assertCandidateCorruptionEvidence(
  beforePayload: string,
  afterPayload: string,
  response: Readonly<{ status: unknown; body: unknown }>,
): void {
  assert.equal(
    response.status,
    503,
    'Corrupt journal must return actual status503',
  );
  assert.equal(
    response.body,
    null,
    'Corrupt503 must not invent a snapshot/error body',
  );
  const before: unknown = JSON.parse(beforePayload);
  const after: unknown = JSON.parse(afterPayload);
  assert.ok(
    candidateAcceptanceObject(before) && candidateAcceptanceObject(after),
    'Corrupt payload objects required',
  );
  const expected = structuredClone(before);
  assert.ok(
    candidateAcceptanceObject(expected.approvals) &&
      candidateAcceptanceObject(expected.approvals.pendingBatch) &&
      candidateAcceptanceObject(expected.approvals.pendingBatch.batch),
    'Original genuine pending binding authority missing',
  );
  const batch = expected.approvals.pendingBatch.batch;
  assert.ok(
    Array.isArray(batch.browserBindings) && batch.browserBindings.length > 0,
    'Original browser bindings must be nonempty',
  );
  batch.browserBindings = [];
  assert.deepEqual(
    after,
    expected,
    'Corruption must preserve all authority except the intended browserBindings',
  );
}
/** Requires a successful actual V2 envelope whose disposition and revision agree with independently read journal authority. */
export function assertCandidateAuthoritativeResponse(
  response: Readonly<{ status: unknown; body: unknown }>,
  session: Readonly<{
    state: string;
    revision: number;
    payload?: string;
  }> | null,
): void {
  assert.equal(
    response.status,
    200,
    'Successful authoritative status200 required',
  );
  assert.ok(
    candidateAcceptanceObject(response.body),
    'Authoritative V2 body required',
  );
  assert.equal(
    response.body.schemaVersion,
    2,
    'Authoritative V2 version required',
  );
  assert.ok(session, 'Actual journal session authority missing');
  assert.ok(
    Number.isSafeInteger(session.revision) && session.revision > 0,
    'Journal revision required',
  );
  assert.equal(
    response.body.serverRevision,
    session.revision,
    'Authoritative server revision differs from journal',
  );
  const states: Readonly<Record<string, readonly string[]>> = {
    Owned: ['Busy'],
    Saved: ['Busy'],
    Publishing: ['Busy'],
    PublicationUnknown: ['UnknownEffect'],
    Blocked: ['UnknownEffect'],
    Expired: ['Expired'],
    Ready: [
      'Completed',
      'Pending',
      'FailedBeforeEffect',
      'NativePendingBrowserResults',
    ],
  };
  let allowed = states[session.state] ?? ['Unavailable'];
  if (session.state === 'Ready' && session.payload) {
    const payload: unknown = JSON.parse(session.payload);
    assert.ok(candidateAcceptanceObject(payload), 'Journal payload required');
    if (payload.turnCompleted === true) allowed = ['Completed'];
    else if (
      Array.isArray(payload.expectedBrowserCallIds) &&
      payload.expectedBrowserCallIds.length > 0
    )
      allowed = ['Pending'];
    else if (
      candidateAcceptanceObject(payload.approvals) &&
      payload.approvals.pendingBatch !== null &&
      payload.approvals.pendingBatch !== undefined
    )
      allowed = ['Pending'];
    else allowed = ['FailedBeforeEffect', 'NativePendingBrowserResults'];
  }
  assert.ok(
    allowed.includes(String(response.body.disposition)),
    'Authoritative disposition differs from journal state',
  );
  if (
    session.payload &&
    (response.body.disposition === 'Pending' ||
      response.body.disposition === 'Completed')
  ) {
    const payload: unknown = JSON.parse(session.payload);
    assert.ok(
      candidateAcceptanceObject(payload) &&
        typeof payload.publicRequest === 'string',
      'Authoritative saved public history required',
    );
    const original: unknown = JSON.parse(payload.publicRequest);
    assert.ok(
      candidateAcceptanceObject(original) && Array.isArray(original.messages),
      'Authoritative canonical messages required',
    );
    assert.ok(
      candidateAcceptanceObject(response.body.snapshot),
      'Authoritative snapshot required',
    );
    assert.deepEqual(
      response.body.snapshot.messages,
      original.messages,
      'Authoritative snapshot differs from journal canonical history',
    );
    if (response.body.disposition === 'Pending') {
      const capability = response.body.snapshot.pendingBrowserRecovery;
      assert.ok(
        candidateAcceptanceObject(capability) &&
          Array.isArray(capability.callIds) &&
          Array.isArray(payload.expectedBrowserCallIds),
        'Actual pending browser IDs required',
      );
      assert.deepEqual(
        [...capability.callIds].sort(),
        [...payload.expectedBrowserCallIds].sort(),
        'Authoritative capability differs from journal pending call IDs',
      );
    }
  }
  if (response.body.disposition === 'Pending') {
    assert.ok(
      candidateAcceptanceObject(response.body.snapshot) &&
        candidateAcceptanceObject(
          response.body.snapshot.pendingBrowserRecovery,
        ),
      'Pending authoritative capability required',
    );
    assert.equal(
      response.body.snapshot.pendingBrowserRecovery.serverRevision,
      session.revision,
      'Pending capability revision differs',
    );
  } else if (candidateAcceptanceObject(response.body.snapshot))
    assert.ok(
      response.body.snapshot.pendingBrowserRecovery === undefined ||
        response.body.snapshot.pendingBrowserRecovery === null,
      'Blocked/completed authoritative response cannot grant a pending capability',
    );
}
/** Actual per-run proxy/page observations, separate from an armed intervention label. */
export interface CandidateFaultObservation {
  readonly scenario: string;
  readonly requestId: string;
  readonly runId: unknown;
  readonly threadId?: string;
  readonly records: readonly Readonly<{
    kind: string;
    requestId: string;
    reason?: string;
    seq?: number;
    bytes: Uint8Array;
  }>[];
  readonly events: readonly Readonly<{
    type: string;
    runId: string;
    requestId?: string;
    monotonicMs?: number;
  }>[];
  readonly error?: unknown;
  readonly recoveryRequired?: boolean;
  readonly transport: readonly Readonly<{
    kind: string;
    abortSource?: string;
    requestId?: string;
    monotonicMs?: number;
  }>[];
}

/** Actual old mounted facade state after an interrupted unknown-effect continuation. */
export interface CandidateUnknownEffectFacts {
  readonly runId: string;
  readonly originalPending: unknown;
  readonly status: Readonly<{
    pending: unknown;
    recovery: Readonly<{ required: boolean }>;
    isLoading: boolean;
    isResuming: boolean;
    events: readonly Readonly<{
      type: string;
      runId: string;
      requestId?: string;
    }>[];
    transport: readonly Readonly<{ kind: string; requestId: string }>[];
  }>;
}

/** Validates the retired local unknown-effect claim using actual consumed ACK observations. */
export function assertCandidateUnknownEffectLocalState(
  facts: CandidateUnknownEffectFacts,
): void {
  const { status, runId, originalPending } = facts;
  assert.ok(
    typeof runId === 'string' && runId.length > 0,
    'Actual unknown-effect run identity required',
  );
  assert.ok(
    candidateAcceptanceObject(originalPending) &&
      typeof originalPending.id === 'string' &&
      originalPending.id.length > 0,
    'Actual original pending identity required',
  );
  assert.equal(
    status.recovery.required,
    true,
    'UnknownEffect must retain the required recovery barrier',
  );
  assert.equal(
    status.isLoading,
    false,
    'UnknownEffect SDK must be idle after retirement',
  );
  assert.equal(
    status.isResuming,
    false,
    'UnknownEffect SDK resume claim must be retired',
  );
  const lifecycle = status.transport.filter(
    (record) => record.requestId === runId,
  );
  const disposed = lifecycle.filter((record) => record.kind === 'disposed');
  assert.equal(disposed.length, 1, 'Actual current SDK disposal required');
  const disposalIndex = lifecycle.indexOf(disposed[0]);
  if (lifecycle.some((record) => record.kind === 'complete')) {
    assert.deepEqual(
      lifecycle.map((record) => record.kind),
      ['started', 'disposed', 'complete'],
      'Actual current completed lifecycle must dispose before its unique completion',
    );
  } else {
    assert.ok(
      lifecycle.some(
        (record, index) =>
          index < disposalIndex &&
          ['error', 'aborted', 'deadline'].includes(record.kind),
      ),
      'Actual current transport settlement must precede disposal',
    );
    assert.equal(
      disposalIndex,
      lifecycle.length - 1,
      'Retired current lifecycle cannot resume after disposal',
    );
  }
  const acknowledgements = status.events.filter(
    (event) =>
      event.type === 'RUN_STARTED' &&
      (event.runId === runId || event.requestId === runId),
  );
  assert.ok(
    acknowledgements.length <= 1,
    'UnknownEffect consumed ACK must be unique',
  );
  for (const acknowledgement of acknowledgements) {
    assert.equal(
      acknowledgement.runId,
      runId,
      'Consumed ACK run identity differs',
    );
    assert.equal(
      acknowledgement.requestId,
      runId,
      'Consumed ACK request identity differs',
    );
  }
  if (acknowledgements.length === 1)
    assert.equal(
      status.pending,
      null,
      'ACKed unknown-effect pending must be cleared',
    );
  else
    assert.deepEqual(
      status.pending,
      originalPending,
      'PreACK unknown-effect pending must preserve the exact original inert batch',
    );
}

/** Reports whether actual scoped receipts have reached the malformed-run validation boundary. */
export function isCandidateMalformedBoundaryReady(
  records: CandidateFaultObservation['records'],
  requestId: string,
): boolean {
  const scoped = records.filter((record) => record.requestId === requestId);
  return (
    scoped.some((record) => record.kind === 'complete') ||
    (scoped.some((record) => record.kind === 'downstream-closed') &&
      scoped.some((record) => record.kind === 'fault'))
  );
}

/** Combines original parser failure proof with later public iterator/lifecycle observations for retained validation. */
export function refreshCandidateFaultObservation(
  original: Omit<CandidateFaultObservation, 'records'>,
  latest: Pick<CandidateFaultObservation, 'events' | 'transport'>,
): Omit<CandidateFaultObservation, 'records'> {
  assert.deepEqual(
    latest.events.slice(0, original.events.length),
    original.events,
    'Latest consumed events must preserve the original prefix without rollback',
  );
  assert.deepEqual(
    latest.transport.slice(0, original.transport.length),
    original.transport,
    'Latest lifecycle must preserve the original prefix without rollback',
  );
  return { ...original, events: latest.events, transport: latest.transport };
}

/** Checks exact stage counts around a read-only operation with an explicit expected status-read delta. */
export function assertCandidateStageCounts(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  expectedStatusReadDelta: 0 | 1 = 0,
): void {
  assert.ok(
    expectedStatusReadDelta === 0 || expectedStatusReadDelta === 1,
    'Expected status-read delta must be exactly zero or one',
  );
  const expected =
    expectedStatusReadDelta === 0
      ? before
      : { ...before, 'status-read': (before['status-read'] ?? 0) + 1 };
  assert.deepEqual(after, expected, 'Read-only operation stage counts changed');
}

/** Independently captured run, provider, journal and observer facts around an inert operation. */
export interface CandidateUnchangedSnapshot {
  readonly state: unknown;
  readonly runs: readonly unknown[];
  readonly providerCount: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly observerAttempts: readonly number[];
}

/** Actual response, tombstone lineage and independent inert-read witnesses for the maintained expiry fixture. */
export interface CandidateExpiredReadFacts {
  readonly response: Readonly<{
    status: number;
    body: unknown;
    bodyText: string;
    bodyBase64: string;
  }>;
  readonly publishedState: unknown;
  readonly before: CandidateUnchangedSnapshot;
  readonly after: CandidateUnchangedSnapshot;
  readonly beforeWitnesses: readonly unknown[];
  readonly afterWitnesses: readonly unknown[];
  readonly controls: unknown;
  readonly publicState: Readonly<{
    pending: unknown;
    localError?: unknown;
    error?: unknown;
  }>;
}

/** Checks the actual maintained-expiry recovery response against its retained physical proof. */
export function assertCandidateExpiredRead(
  facts: CandidateExpiredReadFacts,
): void {
  assert.equal(
    facts.response.status,
    410,
    'Maintained expired recovery must return 410',
  );
  assert.equal(
    facts.response.body,
    null,
    'Expired response cannot grant a snapshot or capability',
  );
  assert.equal(facts.response.bodyText, '', 'Expired raw entity must be empty');
  assert.equal(
    facts.response.bodyBase64,
    '',
    'Expired raw entity bytes must be empty',
  );
  assert.equal(
    facts.publicState.pending,
    null,
    'Expired public view cannot grant pending authority',
  );
  const handled = facts.publicState.localError || facts.publicState.error;
  assert.ok(
    (typeof handled === 'string' &&
      handled.includes('Recovery read failed: 410')) ||
      (candidateAcceptanceObject(handled) &&
        typeof handled.message === 'string' &&
        handled.message.includes('Recovery read failed: 410')),
    'Actual mounted expired-read error required',
  );
  assert.ok(
    Array.isArray(facts.controls) && facts.controls.length === 2,
    'Actual expiry and maintenance controls required',
  );
  const controls = facts.controls;
  assert.deepEqual(
    controls.map((control) => {
      assert.ok(candidateAcceptanceObject(control));
      assert.equal(
        control.method,
        'POST',
        'Actual expiry control method differs',
      );
      assert.equal(control.status, 200, 'Actual expiry control failed');
      return control.name;
    }),
    ['expire-native-payload', 'maintain-native'],
    'Actual expiry control lineage differs',
  );
  assert.ok(
    candidateAcceptanceObject(controls[0]) &&
      candidateAcceptanceObject(controls[1]) &&
      typeof controls[1].bodyText === 'string',
  );
  assert.equal(
    controls[0].bodyText,
    '',
    'Expiry control response must remain empty',
  );
  assert.deepEqual(
    JSON.parse(controls[1].bodyText),
    { count: 1 },
    'Actual maintenance must retire the owned expired session',
  );
  assert.equal(
    facts.before.counts['maintenance-call'],
    1,
    'Actual maintenance observation required',
  );
  const published = facts.publishedState,
    retired = facts.before.state;
  assert.ok(
    candidateAcceptanceObject(published) &&
      candidateAcceptanceObject(retired) &&
      candidateAcceptanceObject(published.session) &&
      candidateAcceptanceObject(retired.session),
    'Actual published and retired journal lineage required',
  );
  const original = published.session,
    tombstone = retired.session;
  assert.equal(
    original.state,
    'Ready',
    'Expiry must derive from the actual published Ready session',
  );
  assert.ok(
    typeof original.payload === 'string' &&
      original.payload.length > 0 &&
      original.ever_saved === true,
    'Published saved payload lineage required',
  );
  assert.equal(
    tombstone.state,
    'Retired',
    'Maintained expired journal must be Retired',
  );
  assert.equal(
    tombstone.ever_saved,
    true,
    'Retired saved lineage must remain recorded',
  );
  for (const key of ['id', 'selector', 'agent', 'scope']) {
    assert.ok(
      typeof original[key] === 'string' && original[key].length > 0,
      'Actual session identity required',
    );
    assert.equal(
      tombstone[key],
      original[key],
      `Retired session ${key} identity changed`,
    );
  }
  for (const key of ['revision', 'generation']) {
    assert.ok(
      Number.isSafeInteger(original[key]) &&
        Number(original[key]) > 0 &&
        Number.isSafeInteger(tombstone[key]) &&
        Number(tombstone[key]) > Number(original[key]),
      `Retired ${key} must advance from publication`,
    );
  }
  assert.ok(
    typeof original.expires_at === 'string' &&
      typeof tombstone.expires_at === 'string' &&
      Number.isFinite(Date.parse(original.expires_at)) &&
      Number.isFinite(Date.parse(tombstone.expires_at)) &&
      Date.parse(tombstone.expires_at) < Date.parse(original.expires_at),
    'Actual expiry timestamp must move before original payload retention',
  );
  for (const key of ['payload', 'token', 'lease_until', 'admitted_request'])
    assert.equal(tombstone[key], null, `Retired ${key} must be purged`);
  const rows = (state: Record<string, unknown>, key: string) => {
    const values = state[key];
    assert.ok(Array.isArray(values), `Actual ${key} rows required`);
    return values.map((value) => {
      assert.ok(candidateAcceptanceObject(value));
      return value;
    });
  };
  const members = rows(retired, 'members'),
    originalMembers = rows(published, 'members');
  const batches = rows(retired, 'batches'),
    originalBatches = rows(published, 'batches');
  const invocations = rows(retired, 'invocations'),
    originalInvocations = rows(published, 'invocations');
  const compareIds = (
    current: readonly Record<string, unknown>[],
    prior: readonly Record<string, unknown>[],
    key: string,
    label: string,
  ) => {
    assert.ok(prior.length > 0, `Actual published ${label} lineage required`);
    for (const row of [...current, ...prior])
      assert.ok(
        typeof row[key] === 'string' && row[key].length > 0,
        `Actual ${label} identity required`,
      );
    assert.equal(
      new Set(prior.map((row) => row[key])).size,
      prior.length,
      `Distinct published ${label} identities required`,
    );
    assert.deepEqual(
      current.map((row) => row[key]).sort(),
      prior.map((row) => row[key]).sort(),
      `Retired ${label} identities changed`,
    );
  };
  compareIds(members, originalMembers, 'call_id', 'member');
  compareIds(batches, originalBatches, 'batch_id', 'batch');
  compareIds(invocations, originalInvocations, 'call_id', 'invocation');
  for (const member of members) {
    const prior = originalMembers.find((row) => row.call_id === member.call_id);
    assert.ok(prior);
    for (const key of [
      'session_id',
      'batch_id',
      'request_id',
      'kind',
      'captured_generation',
    ])
      assert.equal(
        member[key],
        prior[key],
        `Retired member ${key} lineage changed`,
      );
    assert.equal(
      member.session_id,
      original.id,
      'Retired member session differs',
    );
    assert.equal(member.state, 'Retired', 'Expired member must be retired');
    for (const key of [
      'private_descriptor',
      'admitted_generation',
      'admitted_revision',
      'result_digest',
    ])
      assert.equal(
        member[key],
        null,
        `Retired member ${key} authority must be absent`,
      );
  }
  for (const batch of batches) {
    const prior = originalBatches.find(
      (row) => row.batch_id === batch.batch_id,
    );
    assert.ok(prior);
    assert.equal(
      batch.session_id,
      original.id,
      'Retired batch session differs',
    );
    for (const key of ['member_count', 'published_revision'])
      assert.equal(
        batch[key],
        prior[key],
        `Retired batch ${key} lineage changed`,
      );
    assert.equal(batch.state, 'Retired', 'Expired batch must be retired');
    assert.equal(
      batch.admitted_generation,
      null,
      'Expired batch cannot retain admitted generation',
    );
    assert.equal(
      batch.admitted_revision,
      null,
      'Expired batch cannot retain admitted revision',
    );
  }
  for (const invocation of invocations) {
    const prior = originalInvocations.find(
      (row) => row.call_id === invocation.call_id,
    );
    assert.ok(prior);
    assert.equal(
      invocation.session_id,
      original.id,
      'Retired invocation session differs',
    );
    for (const key of ['state', 'captured_generation', 'dispatch_generation'])
      assert.equal(
        invocation[key],
        prior[key],
        `Retired invocation ${key} lineage changed`,
      );
    assert.equal(
      invocation.descriptor,
      null,
      'Retired invocation descriptor must be purged',
    );
  }
  assert.deepEqual(
    retired.effects,
    published.effects,
    'Expiry cannot introduce native effects',
  );
  assertCandidateUnchangedSnapshot(facts.before, facts.after, 1);
  assert.deepEqual(
    facts.afterWitnesses,
    facts.beforeWitnesses,
    'Expired read cannot introduce native witnesses',
  );
}

/** Requires all original inert-operation facts while keeping any explicit status-read expectation scoped. */
export function assertCandidateUnchangedSnapshot(
  before: CandidateUnchangedSnapshot,
  after: CandidateUnchangedSnapshot,
  expectedStatusReadDelta: 0 | 1 = 0,
): void {
  assert.deepEqual(
    after.runs,
    before.runs,
    'Inert operation run requests changed',
  );
  assert.equal(
    after.providerCount,
    before.providerCount,
    'Inert operation provider count changed',
  );
  assertCandidateStageCounts(
    before.counts,
    after.counts,
    expectedStatusReadDelta,
  );
  assert.deepEqual(
    after.state,
    before.state,
    'Inert operation physical journal state changed',
  );
  assert.deepEqual(
    after.observerAttempts,
    before.observerAttempts,
    'Inert operation observer attempts changed',
  );
}

/** Requires exact mutation and decoder proof for complete HTTP entities or causal client-disposal aborts. */
function assertCandidateMalformedOutcome(
  observation: CandidateFaultObservation,
): void {
  const records = observation.records.filter(
    (record) => record.requestId === observation.requestId,
  );
  const sequence = (record: (typeof records)[number]) => {
    const value = record.seq;
    assert.ok(
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
      'Actual malformed receipt sequence required',
    );
    return value;
  };
  for (let index = 0; index < records.length; index++)
    assert.ok(
      index === 0 || sequence(records[index - 1]) < sequence(records[index]),
      'Malformed receipt sequence must remain strictly ordered',
    );
  const only = (kind: string) => {
    const found = records.filter((record) => record.kind === kind);
    assert.equal(found.length, 1, `Unique malformed ${kind} receipt required`);
    return found[0];
  };
  const mutation = only('mutation'),
    ackWrite = only('downstream-ack-write');
  const completed = records.filter((record) => record.kind === 'complete');
  const normalEof = completed.length > 0;
  let terminal: (typeof records)[number];
  if (normalEof) {
    terminal = only('complete');
    assert.deepEqual(
      records.filter(
        (record) =>
          record.kind === 'fault' || record.kind === 'downstream-closed',
      ),
      [],
      'Normal malformed HTTP completion cannot include closure or fault receipts',
    );
  } else {
    const fault = only('fault');
    terminal = only('downstream-closed');
    assert.equal(fault.reason, 'aborted', 'Unexpected malformed proxy fault');
    assert.ok(
      sequence(terminal) < sequence(fault),
      'Malformed downstream closure must precede its aborted fault',
    );
  }
  assert.equal(
    mutation.reason,
    'malform-after-upstream-ack',
    'Actual malformed mutation required',
  );
  assert.ok(
    sequence(ackWrite) < sequence(mutation) &&
      sequence(mutation) < sequence(terminal),
    'Malformed mutation/closure/fault causal order differs',
  );
  const sourceRecords = records.filter(
    (record) => record.kind === 'upstream-body',
  );
  const deliveredRecords = records.filter(
    (record) => record.kind === 'delivered-body',
  );
  for (const record of [...sourceRecords, ...deliveredRecords])
    assert.ok(
      sequence(record) < sequence(terminal),
      'Late malformed source/delivered bytes after terminal boundary',
    );
  const source = Buffer.concat(
    sourceRecords.map((record) => Buffer.from(record.bytes)),
  );
  const delivered = Buffer.concat(
    deliveredRecords.map((record) => Buffer.from(record.bytes)),
  );
  if (normalEof) {
    assert.equal(
      delivered.length,
      source.length,
      'Normal malformed HTTP completion requires the entire source entity',
    );
    const text = source.toString('utf8');
    assert.ok(
      /\r?\n\r?\n$/.test(text),
      'Complete genuine source SSE terminal required',
    );
    const events = text
      .split(/\r?\n\r?\n/)
      .filter((frame) => frame.trim())
      .map(
        (frame) =>
          JSON.parse(
            frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n'),
          ) as unknown,
      );
    assert.ok(
      events.every(candidateAcceptanceObject),
      'Genuine source events must be objects',
    );
    const first = events[0];
    const last = events.at(-1);
    assert.ok(
      candidateAcceptanceObject(first) && candidateAcceptanceObject(last),
    );
    assert.equal(
      first.type,
      'RUN_STARTED',
      'Genuine source ACK must start complete protocol',
    );
    const terminals = events.filter(
      (event) =>
        candidateAcceptanceObject(event) &&
        (event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR'),
    );
    assert.equal(
      terminals.length,
      1,
      'Exactly one genuine source terminal required',
    );
    assert.equal(last, terminals[0], 'Genuine source terminal must be last');
    assert.equal(
      last.type,
      'RUN_FINISHED',
      'Normal malformed source must finish a non-error protocol',
    );
    assert.ok(
      typeof observation.threadId === 'string' &&
        observation.threadId.length > 0,
      'Actual current source thread identity required',
    );
    for (const event of [first, last]) {
      assert.equal(
        event.runId,
        observation.runId,
        'Source terminal run identity differs',
      );
      assert.equal(
        event.threadId,
        observation.threadId,
        'Source terminal thread identity differs',
      );
    }
  }
  const beforeMutation = Buffer.concat(
    sourceRecords
      .filter((record) => sequence(record) < sequence(mutation))
      .map((record) => Buffer.from(record.bytes)),
  ).toString('utf8');
  const boundaries = [...beforeMutation.matchAll(/\r?\n\r?\n/g)];
  assert.ok(
    boundaries.length >= 2,
    'Complete genuine postACK frame must precede malformed mutation',
  );
  const ackBoundary = boundaries[0];
  const ackEnd = ackBoundary.index + ackBoundary[0].length;
  const postEnd = boundaries[1].index;
  const postFrame = beforeMutation.slice(ackEnd, postEnd);
  const data = postFrame.indexOf('data:');
  const opening = data < 0 ? -1 : postFrame.indexOf('{', data + 5);
  assert.ok(opening >= 0, 'Genuine postACK JSON opening required');
  JSON.parse(
    postFrame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n'),
  );
  const offset = Buffer.byteLength(
    beforeMutation.slice(0, ackEnd) + postFrame.slice(0, opening),
    'utf8',
  );
  assert.ok(
    delivered.length > offset && delivered.length <= source.length,
    'Actual malformed delivered source prefix required',
  );
  const expected = Buffer.from(source.subarray(0, delivered.length));
  assert.equal(
    expected[offset],
    123,
    'Actual genuine opening JSON byte required',
  );
  expected[offset] = 33;
  assert.deepEqual(
    delivered,
    expected,
    'Malformed delivery must change exactly one genuine source byte',
  );
  let preceding = 0;
  const corruptDelivery = deliveredRecords.find((record) => {
    preceding += record.bytes.length;
    return preceding > offset;
  });
  assert.ok(
    corruptDelivery &&
      sequence(mutation) < sequence(corruptDelivery) &&
      sequence(corruptDelivery) < sequence(terminal),
    'Corrupt delivered frame must precede HTTP terminal boundary',
  );
  const error = observation.error;
  assert.ok(
    (candidateAcceptanceObject(error) &&
      error.name === 'SyntaxError' &&
      typeof error.message === 'string' &&
      error.message.trim().length > 0) ||
      (typeof error === 'string' && /^SyntaxError: \S[\s\S]*$/.test(error)),
    'Actual public SyntaxError parser observation required',
  );
  assert.equal(
    observation.recoveryRequired,
    true,
    'Actual parser failure must require recovery',
  );
  const consumed = observation.events.filter(
    (event) =>
      event.type === 'RUN_STARTED' && event.runId === observation.runId,
  );
  assert.equal(consumed.length, 1, 'Actual current consumed ACK required');
  assert.equal(
    consumed[0].requestId,
    observation.runId,
    'Consumed ACK public request identity differs',
  );
  const lifecycle = observation.transport.filter(
    (record) => record.requestId === observation.runId,
  );
  assert.deepEqual(
    lifecycle.map((record) => record.kind),
    ['started', 'error', 'disposed'],
    'Actual same-request parser error then disposal required without caller/deadline/complete',
  );
  const clock = (value: number | undefined) => {
    assert.ok(
      typeof value === 'number' && Number.isFinite(value),
      'Actual parser lifecycle clock required',
    );
    return value;
  };
  assert.ok(
    clock(lifecycle[0].monotonicMs) <= clock(consumed[0].monotonicMs) &&
      clock(consumed[0].monotonicMs) < clock(lifecycle[1].monotonicMs) &&
      clock(lifecycle[1].monotonicMs) <= clock(lifecycle[2].monotonicMs),
    'Consumed ACK/parser error/disposal clock order differs',
  );
}
/** Requires actual per-run mutation/source/delivery/consumedACK evidence and rejects infrastructure faults. */
export function assertCandidateProxyIntervention(
  observation: CandidateFaultObservation,
): void {
  const records = observation.records.filter(
    (record) => record.requestId === observation.requestId,
  );
  const has = (kind: string) => records.some((record) => record.kind === kind);
  const bytes = (kind: string) =>
    Buffer.concat(
      records
        .filter((record) => record.kind === kind)
        .map((record) => Buffer.from(record.bytes)),
    );
  const mode: Readonly<Record<string, string>> = {
    'failure.preack-disconnect': 'disconnect-before-delivered-ack',
    'failure.ack-disconnect': 'disconnect-after-delivered-ack',
    'failure.malformed-ack': 'malform-after-upstream-ack',
  };
  const reason = mode[observation.scenario];
  assert.ok(
    has('upstream-ack') && bytes('upstream-body').length > 0,
    'Actual upstream ACK/source boundary required',
  );
  const consumed = observation.events.filter(
    (event) =>
      event.type === 'RUN_STARTED' && event.runId === observation.runId,
  );
  if (reason)
    assert.deepEqual(
      records
        .filter((record) => record.kind === 'mutation')
        .map((record) => record.reason),
      [reason],
      'Exact intended per-run mutation required',
    );
  const timeout = observation.scenario === 'failure.timeout';
  const cancelled = observation.scenario === 'failure.cancel-after-ack';
  if (observation.scenario === 'failure.preack-disconnect' || timeout) {
    assert.equal(
      bytes('delivered-body').length,
      0,
      'PreACK/held intervention delivered bytes',
    );
    assert.ok(
      !has('downstream-ack-write'),
      'PreACK/held intervention delivered ACK',
    );
    assert.deepEqual(consumed, [], 'PreACK/held intervention consumed ACK');
  } else {
    assert.ok(has('downstream-ack-write'), 'Actual delivered ACK required');
    assert.equal(consumed.length, 1, 'Actual page consumed ACK required');
  }
  if (observation.scenario === 'failure.malformed-ack') {
    const source = bytes('upstream-body');
    const delivered = bytes('delivered-body');
    assert.ok(
      delivered.length > 0 && !source.equals(delivered),
      'Malformed delivered bytes must differ from genuine source',
    );
    const frames = (value: Buffer) =>
      value
        .toString('utf8')
        .split(/\r?\n\r?\n/)
        .filter((frame) => frame.trim())
        .map((frame) =>
          frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        );
    const actualSource = frames(source);
    assert.ok(
      actualSource.length >= 2,
      'Genuine postACK source frame required',
    );
    const ack = JSON.parse(actualSource[0]);
    assert.equal(ack.type, 'RUN_STARTED', 'Actual source ACK required');
    assert.equal(ack.runId, observation.runId, 'Actual source ACK run differs');
    JSON.parse(actualSource[1]);
    const changed = frames(delivered);
    assert.ok(
      changed.length >= 2,
      'Malformed postACK delivered frame required',
    );
    assert.equal(changed[0], actualSource[0], 'Delivered ACK bytes differ');
    assert.equal(
      changed[1],
      '!' + actualSource[1].slice(1),
      'Malformed intervention must change exactly the genuine postACK opening JSON byte',
    );
    assert.throws(
      () => JSON.parse(changed[1]),
      'Actual malformed postACK JSON required',
    );
  }
  const source = timeout ? 'deadline' : cancelled ? 'caller' : undefined;
  if (source) {
    assert.ok(
      observation.transport.some(
        (record) =>
          record.kind === (timeout ? 'deadline' : 'aborted') &&
          record.abortSource === source,
      ),
      'Actual caller/deadline abort required',
    );
    if (timeout)
      assert.ok(
        observation.transport.some((record) => record.kind === 'deadline'),
        'Actual deadline required',
      );
    assert.ok(
      has('downstream-closed'),
      'Actual held downstream closure required',
    );
  }
  const faults = records.filter((record) => record.kind === 'fault');
  if (observation.scenario === 'failure.malformed-ack') {
    assertCandidateMalformedOutcome(observation);
    return;
  }
  for (const fault of faults)
    assert.ok(
      source &&
        fault.reason === 'Held response aborted' &&
        has('downstream-closed'),
      `Unexpected proxy infrastructure fault: ${fault.reason}`,
    );
}

/** Closes owned request processing and validates the retained final acceptance records, retaining independent errors. */
export async function finalizeCandidateAcceptance(
  close: () => Promise<void>,
  validate: () => void,
): Promise<void> {
  const errors: unknown[] = [];
  try {
    await close();
  } catch (error) {
    errors.push(error);
  }
  try {
    validate();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      'Candidate final request acceptance/cleanup failed',
    );
}

/** Final actual native rejection receipt, scoped to its original browser run and proxy request. */
export interface CandidateDefinitiveRejectionObservation {
  readonly requestId: string;
  readonly runId: unknown;
  readonly records: readonly Readonly<{
    kind: string;
    requestId: string;
    status?: number;
    reason?: string;
    bytes: Uint8Array;
    incomingBody?: Uint8Array;
  }>[];
}
/** Checks the actual definitive rejection receipt retained after owned request processing drains. */
export function assertCandidateDefinitiveRejection(
  observation: CandidateDefinitiveRejectionObservation,
): void {
  assert.ok(
    typeof observation.runId === 'string' && observation.runId.length > 0,
    'Original rejected run identity required',
  );
  const records = observation.records.filter(
    (record) => record.requestId === observation.requestId,
  );
  const requests = records.filter((record) => record.kind === 'request');
  assert.equal(
    requests.length,
    1,
    'Exactly one original rejection request required',
  );
  assert.ok(
    requests[0].incomingBody,
    'Original rejected request entity required',
  );
  const input: unknown = JSON.parse(
    Buffer.from(requests[0].incomingBody).toString('utf8'),
  );
  assert.ok(
    candidateAcceptanceObject(input),
    'Original rejected run input required',
  );
  assert.equal(
    input.runId,
    observation.runId,
    'Definitive receipt belongs to a different run',
  );
  assert.deepEqual(
    records
      .filter((record) => record.kind === 'upstream-headers')
      .map((record) => record.status),
    [413],
    'Actual upstream status413 required',
  );
  assert.deepEqual(
    records
      .filter((record) => record.kind === 'delivered-headers')
      .map((record) => record.status),
    [413],
    'Actual delivered status413 required',
  );
  assert.equal(
    records.filter((record) => record.kind === 'complete').length,
    1,
    'Normal definitive rejection response must complete',
  );
  const entity = (kind: string) =>
    Buffer.concat(
      records
        .filter((record) => record.kind === kind)
        .map((record) => Buffer.from(record.bytes)),
    );
  assert.deepEqual(
    entity('delivered-body'),
    entity('upstream-body'),
    'Delivered rejection entity bytes differ from actual upstream',
  );
  assert.deepEqual(
    records.filter((record) =>
      ['fault', 'mutation', 'upstream-ack', 'downstream-ack-write'].includes(
        record.kind,
      ),
    ),
    [],
    'Definitive rejection cannot contain a proxy fault, mutation or ACK',
  );
}

/** Original pass-mode proxy source/delivery facts, independently of an HTTP EOF observation. */
export interface CandidateOriginalRunRecord {
  readonly requestId: string;
  readonly seq: number;
  readonly kind: string;
  readonly bytes: Uint8Array;
  readonly reason?: string;
}
/** Decodes the actual original source protocol while classifying its scoped transport evidence. */
export function captureCandidateOriginalRun<T>(
  records: readonly CandidateOriginalRunRecord[],
  requestId: string,
  decode: (capture: Readonly<{ body: string; truncated: boolean }>) => T,
): T {
  const scoped = records.filter((record) => record.requestId === requestId);
  const source = scoped.filter((record) => record.kind === 'upstream-body');
  const delivered = scoped.filter((record) => record.kind === 'delivered-body');
  const sourceBytes = Buffer.concat(
    source.map((record) => Buffer.from(record.bytes)),
  );
  // The actual strict protocol decoder must establish a complete successful terminal before any disposal can be accepted.
  const decoded = decode({
    body: sourceBytes.toString('utf8'),
    truncated: false,
  });
  assert.ok(
    scoped.every(
      (record, index) =>
        Number.isSafeInteger(record.seq) &&
        record.seq > 0 &&
        (index === 0 || record.seq > scoped[index - 1].seq),
    ),
    'Original protocol record sequence must remain strictly ordered',
  );
  assert.deepEqual(
    scoped.filter((record) => record.kind === 'mutation'),
    [],
    'Original pass-mode protocol cannot contain a mutation',
  );
  assert.ok(source.length > 0, 'Actual complete source protocol required');
  assert.deepEqual(
    Buffer.concat(delivered.map((record) => Buffer.from(record.bytes))),
    sourceBytes,
    'Original delivered protocol bytes must equal the entire actual source',
  );
  const closes = scoped.filter((record) => record.kind === 'downstream-closed');
  assert.ok(closes.length <= 1, 'Original disposal closure must be unique');
  const close = closes[0];
  if (close)
    assert.ok(
      [...source, ...delivered].every((record) => record.seq < close.seq),
      'Source or delivered bytes arrived after terminal disposal closure',
    );
  const lastSource = source[source.length - 1];
  for (const fault of scoped.filter((record) => record.kind === 'fault')) {
    assert.equal(fault.reason, 'aborted', 'Unexpected original protocol fault');
    assert.ok(
      close && lastSource.seq < close.seq && close.seq < fault.seq,
      'Only actual postterminal disposal aborted after downstream closure is permitted',
    );
  }
  return decoded;
}

/** Actual before/after phase observations; these values never grant SDK or journal authority. */
export interface CandidateWarmPhaseCounters {
  readonly entries: readonly Readonly<{
    seq: number;
    correlation?: string;
    receiptId?: string;
    canonicalCallId?: string;
    toolName?: string;
    arguments?: unknown;
    result?: unknown;
  }>[];
  readonly attemptSequences: readonly number[];
  readonly holdReceiptIds: readonly string[];
  readonly computations: number;
  readonly providerRequests: readonly unknown[];
  readonly effects: readonly object[];
  readonly nativeWitnesses: readonly object[];
}
/** Expected fixture call values joined to independently captured original publication facts. */
export interface CandidateWarmPhaseFacts {
  readonly expected: Readonly<{
    runId: string;
    threadId: string;
    browsers: readonly Readonly<{
      id: string;
      name: string;
      arguments: Readonly<Record<string, unknown>>;
      correlation: string;
    }>[];
    protected: readonly Readonly<{
      id: string;
      name: string;
      arguments: Readonly<Record<string, unknown>>;
    }>[];
  }>;
  readonly sourceEvents: readonly Record<string, unknown>[];
  readonly publicState: Readonly<{
    threadId: string;
    pendingInterrupts: unknown;
    pendingConversationRecovery: unknown;
    events: readonly Readonly<{ type: string; runId: string }>[];
  }>;
  readonly savedSession: Readonly<{
    state: string;
    revision: number;
    payload: string;
  }>;
  readonly before: CandidateWarmPhaseCounters;
  readonly after: CandidateWarmPhaseCounters;
}
/** Resolves the exact complete saved pending browser set, rejecting unknown or already settled identities. */
export function readCandidatePendingBrowserCalls(
  payloadText: string,
): readonly Record<string, unknown>[] {
  const payload: unknown = JSON.parse(payloadText);
  assert.ok(
    candidateAcceptanceObject(payload),
    'Saved pending payload required',
  );
  assert.ok(
    Array.isArray(payload.expectedBrowserCallIds) &&
      payload.expectedBrowserCallIds.length > 0,
    'Complete pending browser IDs required',
  );
  const expected = payload.expectedBrowserCallIds;
  assert.ok(
    expected.every((id) => typeof id === 'string' && id.length > 0) &&
      new Set(expected).size === expected.length,
    'Unique pending browser identities required',
  );
  assert.equal(
    typeof payload.publicRequest,
    'string',
    'Saved canonical public request required',
  );
  const request: unknown = JSON.parse(payload.publicRequest as string);
  assert.ok(
    candidateAcceptanceObject(request) &&
      Array.isArray(request.messages) &&
      Array.isArray(request.tools),
    'Canonical browser declarations/history required',
  );
  const browserNames = request.tools.map((tool) => {
    assert.ok(candidateAcceptanceObject(tool) && typeof tool.name === 'string');
    return tool.name;
  });
  assert.equal(
    new Set(browserNames).size,
    browserNames.length,
    'Unique browser declaration names required',
  );
  const calls: Record<string, unknown>[] = [];
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  const messageIds = new Set<string>();
  for (const message of request.messages) {
    assert.ok(
      candidateAcceptanceObject(message) &&
        typeof message.id === 'string' &&
        !messageIds.has(message.id),
      'Unique canonical message identity required',
    );
    messageIds.add(message.id);
    if (message.toolCalls !== undefined) {
      assert.equal(message.role, 'assistant', 'Canonical call role invalid');
      assert.ok(Array.isArray(message.toolCalls));
      for (const call of message.toolCalls) {
        assert.ok(
          candidateAcceptanceObject(call) &&
            typeof call.id === 'string' &&
            !callIds.has(call.id) &&
            candidateAcceptanceObject(call.function) &&
            typeof call.function.name === 'string' &&
            typeof call.function.arguments === 'string',
          'Unique canonical call identity and arguments required',
        );
        assert.ok(
          candidateAcceptanceObject(JSON.parse(call.function.arguments)),
          'Canonical browser arguments must be objects',
        );
        callIds.add(call.id);
        calls.push(call);
      }
    }
    if (message.role === 'tool') {
      assert.ok(
        typeof message.toolCallId === 'string' &&
          callIds.has(message.toolCallId) &&
          !resultIds.has(message.toolCallId),
        'Canonical result identity invalid',
      );
      resultIds.add(message.toolCallId);
    }
  }
  const pending = calls.filter((call) => {
    assert.ok(candidateAcceptanceObject(call.function));
    return (
      browserNames.includes(String(call.function.name)) &&
      !resultIds.has(String(call.id))
    );
  });
  assert.deepEqual(
    pending.map((call) => call.id),
    expected,
    'Saved pending browser IDs must exactly equal all unanswered declared browser calls',
  );
  return pending;
}

/** Classifies current warm dispatch using complete source, public interruption, saved payload and phase-relative observations. */
export function classifyCandidateWarmPhase(
  facts: CandidateWarmPhaseFacts,
): 'entered-browser-handler' | 'paused-for-protected-interrupt' {
  const { expected, before, after, publicState, savedSession, sourceEvents } =
    facts;
  assert.equal(
    savedSession.state,
    'Ready',
    'Current phase journal must be Ready',
  );
  assert.ok(
    Number.isSafeInteger(savedSession.revision) && savedSession.revision > 0,
    'Current phase revision invalid',
  );
  const payload: unknown = JSON.parse(savedSession.payload);
  assert.ok(
    candidateAcceptanceObject(payload) &&
      payload.formatVersion === 2 &&
      payload.turnCompleted === false &&
      typeof payload.nativeJson === 'string' &&
      payload.nativeJson.length > 0,
    'Current saved pending payload required',
  );
  JSON.parse(payload.nativeJson);
  const request: unknown = JSON.parse(String(payload.publicRequest));
  assert.ok(
    candidateAcceptanceObject(request) &&
      request.threadId === expected.threadId &&
      Array.isArray(request.messages),
    'Saved phase thread/canonical identity differs',
  );
  assert.ok(
    !Object.hasOwn(request, 'runId'),
    'Saved canonical history must omit normalized runId',
  );
  assert.equal(
    publicState.threadId,
    expected.threadId,
    'Public phase thread differs',
  );
  assert.ok(
    publicState.pendingConversationRecovery === null ||
      publicState.pendingConversationRecovery === undefined,
    'Cold pending authority cannot precede explicit restore',
  );
  const first = sourceEvents[0];
  const terminal = sourceEvents.at(-1);
  assert.ok(
    first?.type === 'RUN_STARTED' &&
      terminal?.type === 'RUN_FINISHED' &&
      sourceEvents.filter(
        (event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR',
      ).length === 1,
    'Complete non-error phase source terminal required',
  );
  for (const event of [first, terminal]) {
    assert.equal(
      event.runId,
      expected.runId,
      'Source phase run identity differs',
    );
    assert.equal(
      event.threadId,
      expected.threadId,
      'Source phase thread identity differs',
    );
  }
  assert.equal(
    publicState.events.filter(
      (event) =>
        event.type === 'RUN_FINISHED' && event.runId === expected.runId,
    ).length,
    1,
    'Actual public consumed current terminal required',
  );
  const browsers = readCandidatePendingBrowserCalls(savedSession.payload);
  assert.deepEqual(
    browsers.map((call) => call.id),
    expected.browsers.map((call) => call.id),
    'Current browser pending IDs differ',
  );
  const targets = [...expected.browsers, ...expected.protected];
  assert.equal(
    new Set(targets.map((call) => call.id)).size,
    targets.length,
    'Distinct current phase call IDs required',
  );
  const locations = request.messages
    .flatMap((message, messageIndex) => {
      assert.ok(candidateAcceptanceObject(message));
      return Array.isArray(message.toolCalls)
        ? message.toolCalls.map((call, callIndex) => {
            assert.ok(candidateAcceptanceObject(call));
            return { call, messageIndex, callIndex, messageId: message.id };
          })
        : [];
    })
    .filter((item) => targets.some((call) => call.id === item.call.id));
  assert.equal(
    locations.length,
    targets.length,
    'Complete current canonical call locations required',
  );
  for (const target of targets) {
    const location = locations.find((item) => item.call.id === target.id);
    assert.ok(location && candidateAcceptanceObject(location.call.function));
    assert.equal(
      location.call.function.name,
      target.name,
      'Current canonical call name differs',
    );
    assert.deepEqual(
      JSON.parse(String(location.call.function.arguments)),
      target.arguments,
      'Current canonical arguments differ',
    );
  }
  const starts = sourceEvents.filter(
    (event) => event.type === 'TOOL_CALL_START',
  );
  assert.deepEqual(
    starts.map((event) => event.toolCallId),
    locations.map((item) => item.call.id),
    'Current source call identities/order differ',
  );
  let activeAssistantMessageId: string | undefined;
  for (const event of sourceEvents) {
    if (event.type === 'TEXT_MESSAGE_START') {
      assert.ok(
        typeof event.messageId === 'string' && event.messageId.length > 0,
        'Actual source text parent identity required',
      );
      activeAssistantMessageId = event.messageId;
    }
    if (event.type !== 'TOOL_CALL_START') continue;
    const location = locations.find(
      (item) => item.call.id === event.toolCallId,
    );
    assert.ok(location && candidateAcceptanceObject(location.call.function));
    assert.equal(
      event.toolCallName,
      location.call.function.name,
      'Source call name differs',
    );
    const parent =
      event.parentMessageId ??
      activeAssistantMessageId ??
      `assistant-${String(event.toolCallId)}`;
    assert.equal(
      parent,
      location.messageId,
      'Source/canonical parent location differs',
    );
  }
  assert.deepEqual(
    after.providerRequests.slice(0, before.providerRequests.length),
    before.providerRequests,
    'Historical provider prefix changed',
  );
  assert.equal(
    after.providerRequests.length - before.providerRequests.length,
    1,
    'Exactly one current initial provider request required',
  );
  assert.deepEqual(
    after.effects,
    before.effects,
    'Current initial effects must remain zero and historical effects preserved',
  );
  assert.deepEqual(
    after.nativeWitnesses,
    before.nativeWitnesses,
    'Current initial native outputs must remain zero and historical native witnesses preserved',
  );
  assert.deepEqual(
    after.entries.slice(0, before.entries.length),
    before.entries,
    'Historical observer entry/binding changed',
  );
  assert.deepEqual(
    after.attemptSequences.slice(0, before.attemptSequences.length),
    before.attemptSequences,
    'Historical observer attempts changed',
  );
  assert.deepEqual(
    after.holdReceiptIds.slice(0, before.holdReceiptIds.length),
    before.holdReceiptIds,
    'Historical observer hold receipts changed',
  );
  for (const holds of [before.holdReceiptIds, after.holdReceiptIds]) {
    assert.ok(
      holds.every(
        (receiptId) => typeof receiptId === 'string' && receiptId.length > 0,
      ),
      'Actual hold receipt identities required',
    );
    assert.equal(
      new Set(holds).size,
      holds.length,
      'Distinct actual hold receipts required',
    );
  }
  const newEntries = after.entries.slice(before.entries.length);
  const newHolds = after.holdReceiptIds.slice(before.holdReceiptIds.length);
  const newAttempts = after.attemptSequences.slice(
    before.attemptSequences.length,
  );
  assert.ok(
    Number.isSafeInteger(before.computations) &&
      Number.isSafeInteger(after.computations),
    'Actual phase computation counts required',
  );
  assert.ok(
    Array.isArray(payload.pendingCalls) &&
      candidateAcceptanceObject(payload.approvals),
    'Saved native pending authority required',
  );
  const pendingCalls = payload.pendingCalls;
  assert.deepEqual(
    pendingCalls
      .map((call) => {
        assert.ok(candidateAcceptanceObject(call));
        return call.id;
      })
      .sort(),
    expected.protected.map((call) => call.id).sort(),
    'Exact saved pending protected membership required',
  );
  for (const target of expected.protected) {
    const call = pendingCalls.find(
      (item) => candidateAcceptanceObject(item) && item.id === target.id,
    );
    assert.ok(candidateAcceptanceObject(call));
    assert.equal(call.name, target.name, 'Saved protected name differs');
    assert.deepEqual(
      call.arguments,
      target.arguments,
      'Saved protected arguments differ',
    );
    assert.ok(
      Number.isSafeInteger(call.version) && Number(call.version) > 0,
      'Saved catalog version required',
    );
  }
  const outcome = terminal.outcome;
  if (candidateAcceptanceObject(outcome) && outcome.type === 'interrupt') {
    assert.ok(
      expected.protected.length > 0,
      'A plan cannot invent protected pause authority',
    );
    assert.deepEqual(
      Object.keys(outcome).sort(),
      ['interrupts', 'pendingToolCallIds', 'type'],
      'Exact mixed source outcome required',
    );
    assert.deepEqual(
      outcome.pendingToolCallIds,
      browsers.map((call) => call.id),
      'Source pending browser identity/order differs',
    );
    assert.ok(
      Array.isArray(outcome.interrupts),
      'Complete source interrupts required',
    );
    const warm = publicState.pendingInterrupts;
    assert.ok(
      candidateAcceptanceObject(warm) &&
        typeof warm.id === 'string' &&
        warm.id.length > 0 &&
        Array.isArray(warm.interrupts),
      'Actual public warm interrupt batch required',
    );
    assert.deepEqual(
      warm.interrupts,
      outcome.interrupts,
      'Public warm/source interrupt metadata differs',
    );
    const bound = payload.approvals.pendingBatch;
    assert.ok(
      candidateAcceptanceObject(bound) &&
        candidateAcceptanceObject(bound.batch) &&
        candidateAcceptanceObject(bound.publicLocations),
      'Saved pending approval binding required',
    );
    const publicLocations = bound.publicLocations;
    const batch = bound.batch;
    assert.ok(
      typeof batch.batchId === 'string' &&
        batch.batchId.length > 0 &&
        Array.isArray(batch.protectedRequests) &&
        Array.isArray(batch.browserBindings),
      'Saved complete pending batch required',
    );
    const descriptors = batch.protectedRequests;
    const bindings = batch.browserBindings;
    assert.equal(
      descriptors.length,
      expected.protected.length,
      'Complete protected request set required',
    );
    assert.equal(
      bindings.length,
      expected.browsers.length,
      'Complete browser binding set required',
    );
    const requestIds: string[] = [];
    const checkLocation = (requestId: unknown, callId: string) => {
      assert.ok(
        typeof requestId === 'string' &&
          requestId.length > 0 &&
          !requestIds.includes(requestId),
        'Unique saved native request ID required',
      );
      requestIds.push(requestId);
      const position = publicLocations[requestId];
      const canonical = locations.find((item) => item.call.id === callId);
      assert.ok(candidateAcceptanceObject(position) && canonical);
      assert.deepEqual(
        position,
        {
          assistantMessageId: canonical.messageId,
          messageIndex: canonical.messageIndex,
          callIndex: canonical.callIndex,
        },
        'Saved public binding location differs',
      );
    };
    const wantedInterrupts = descriptors.map((descriptor) => {
      assert.ok(
        candidateAcceptanceObject(descriptor) &&
          descriptor.requiresConfirmation === true &&
          candidateAcceptanceObject(descriptor.call),
      );
      const call = descriptor.call;
      const target = expected.protected.find((entry) => entry.id === call.id);
      assert.ok(target, 'Foreign saved protected identity');
      assert.equal(call.name, target.name);
      assert.deepEqual(call.arguments, target.arguments);
      checkLocation(descriptor.requestId, target.id);
      return {
        id: descriptor.requestId,
        reason: 'tool_call',
        toolCallId: target.id,
        message: 'Approval required for tool call: ' + target.name,
        responseSchema: {
          type: 'object',
          properties: { approved: { type: 'boolean' } },
          required: ['approved'],
        },
      };
    });
    assert.equal(
      new Set(wantedInterrupts.map((interrupt) => interrupt.toolCallId)).size,
      expected.protected.length,
      'Duplicate saved protected identity',
    );
    assert.deepEqual(
      outcome.interrupts,
      wantedInterrupts,
      'Source interrupt metadata differs from saved genuine requests',
    );
    for (const binding of bindings) {
      assert.ok(
        candidateAcceptanceObject(binding) &&
          binding.requiresConfirmation === false,
      );
      const target = expected.browsers.find(
        (entry) => entry.id === binding.callId,
      );
      assert.ok(target, 'Foreign browser binding');
      assert.equal(binding.name, target.name);
      assert.deepEqual(
        binding.arguments,
        target.arguments,
        'Saved browser binding arguments differ',
      );
      checkLocation(binding.requestId, target.id);
    }
    assert.equal(
      new Set(
        bindings.map((binding) => {
          assert.ok(candidateAcceptanceObject(binding));
          return binding.callId;
        }),
      ).size,
      expected.browsers.length,
      'Duplicate saved browser binding',
    );
    assert.deepEqual(
      Object.keys(publicLocations).sort(),
      requestIds.sort(),
      'Saved native/public binding coverage differs',
    );
    assert.equal(
      newEntries.length,
      0,
      'Paused browser phase cannot contain an actual entry or fabricated binding',
    );
    assert.equal(
      newAttempts.length,
      0,
      'Paused browser phase cannot contain a received attempt',
    );
    assert.equal(
      newHolds.length,
      0,
      'Paused browser phase cannot contain a hold receipt',
    );
    assert.equal(
      after.computations,
      before.computations,
      'Paused phase computation count changed',
    );
    return 'paused-for-protected-interrupt';
  }
  assert.equal(
    expected.protected.length,
    0,
    'Protected phase requires a genuine interrupt',
  );
  assert.ok(
    outcome === undefined ||
      (candidateAcceptanceObject(outcome) && outcome.type === 'success'),
    'Ordinary browser phase requires non-error successful outcome',
  );
  assert.ok(
    publicState.pendingInterrupts === null ||
      publicState.pendingInterrupts === undefined,
    'Unexpected public warm interrupt',
  );
  assert.equal(
    payload.approvals.pendingBatch,
    null,
    'Browser-only phase cannot invent protected bindings',
  );
  assert.equal(
    newEntries.length,
    expected.browsers.length,
    'Every original browser must have an actual entered handler witness',
  );
  assert.equal(
    newAttempts.length,
    expected.browsers.length * 2,
    'Every entered browser must have exactly one entry and one hold received attempt',
  );
  assert.equal(
    after.computations - before.computations,
    expected.browsers.length,
    'Entered phase computation delta differs',
  );
  assert.equal(
    new Set(newEntries.map((entry) => entry.receiptId)).size,
    newEntries.length,
    'Distinct actual entry receipts required',
  );
  assert.deepEqual(
    [...newHolds].sort(),
    newEntries.map((entry) => entry.receiptId).sort(),
    'Exact entered browser entry and hold receipt coverage required',
  );
  assert.equal(
    new Set(expected.browsers.map((call) => call.correlation)).size,
    expected.browsers.length,
    'Distinct expected browser correlations required',
  );
  assert.deepEqual(
    newEntries.map((entry) => entry.correlation).sort(),
    expected.browsers.map((call) => call.correlation).sort(),
    'Exact current browser entry correlation coverage required',
  );
  for (const entry of newEntries) {
    const target = expected.browsers.find(
      (call) => call.correlation === entry.correlation,
    );
    assert.ok(
      target &&
        typeof entry.receiptId === 'string' &&
        entry.receiptId.length > 0,
      'Actual registered browser entry witness required',
    );
    assert.equal(entry.toolName, target.name);
    assert.deepEqual(
      entry.arguments,
      target.arguments,
      'Entered original arguments differ',
    );
    assert.equal(
      entry.canonicalCallId,
      undefined,
      'A future/unentered canonical binding cannot substitute for the original entry',
    );
  }
  return 'entered-browser-handler';
}

/** Public authority-bearing state independently observed around one explicit recovery read. */
export interface CandidateReadAdoptionState {
  readonly pending: unknown;
  readonly pendingInterrupts?: unknown;
  readonly messages?: unknown;
  readonly state?: unknown;
  readonly recovery: Readonly<{ revision: number; required: boolean }>;
}

/** Validates local adoption of an actual authoritative response independently of its server/PG validation. */
export function assertCandidateReadAdoption(
  response: Readonly<{ disposition: string; snapshot?: unknown }>,
  before: CandidateReadAdoptionState,
  after: CandidateReadAdoptionState,
): void {
  if (response.snapshot !== undefined && response.snapshot !== null) {
    if (response.disposition !== 'Pending')
      assert.equal(
        after.pending,
        null,
        'Completed snapshot must clear pending authority',
      );
    return;
  }
  for (const key of [
    'pending',
    'pendingInterrupts',
    'messages',
    'state',
    'recovery',
  ] as const) {
    assert.deepEqual(
      after[key],
      before[key],
      `Snapshotless authoritative read must preserve ${key}`,
    );
  }
  if (before.pending !== null && before.pending !== undefined) {
    assert.equal(
      before.recovery.required,
      true,
      'Retained pending authority must remain inert behind the required recovery barrier',
    );
  }
}

/** Builds the fixture card's resolved public node; native wire and stored JSON retain plain props. */
export function candidateResolvedUiAnswer(text: string) {
  return {
    ui: [
      {
        CandidateCard: {
          props: { complete: true, partialValue: { text }, value: { text } },
        },
      },
    ],
  };
}

/** Joins an ordinary public-facade prediction to its retained authority and explicit thread lifecycle. */
export function assertCandidateOrdinaryThreadQualification(
  value: unknown,
): void {
  const obj = (item: unknown): Record<string, unknown> => {
    assert.ok(
      candidateAcceptanceObject(item),
      'Ordinary qualification object required',
    );
    return item;
  };
  const arr = (item: unknown): unknown[] => {
    assert.ok(Array.isArray(item), 'Ordinary qualification array required');
    return item;
  };
  const text = (item: unknown): string => {
    assert.ok(
      typeof item === 'string' && item.length > 0,
      'Ordinary qualification identity required',
    );
    return item;
  };
  const number = (item: unknown): number => {
    assert.ok(
      typeof item === 'number' && Number.isFinite(item),
      'Ordinary qualification finite receipt required',
    );
    return item;
  };
  const root = obj(value);
  const facade = text(root.facade);
  assert.ok(
    [
      'chat',
      'structured-chat',
      'ui-chat',
      'completion',
      'structured-completion',
      'ui-completion',
    ].includes(facade),
  );
  const completion = facade.endsWith('completion');
  assert.ok(root.api === 'chat-completions' || root.api === 'responses');
  const configuration = obj(root.configuration);
  const baseline = obj(root.baseline);
  const originalState = obj(baseline.state);
  const originalSession = obj(originalState.session);
  const oldThread = text(originalSession.selector);
  const originalPayload = obj(JSON.parse(text(originalSession.payload)));
  const originalRequest = obj(JSON.parse(text(originalPayload.publicRequest)));
  const originalMessages = arr(originalRequest.messages);
  assert.equal(originalSession.state, 'Ready');
  assert.equal(originalPayload.turnCompleted, true);
  assert.equal(originalRequest.threadId, oldThread);
  const accepted = obj(root.accepted);
  const request = obj(accepted.request);
  const input = obj(request.input);
  const runId = text(input.runId);
  const proxyId = text(request.requestId);
  const targetThread = text(input.threadId);
  const receipt = obj(accepted.receipt);
  const publicState = obj(accepted.publicState);
  const after = obj(accepted.after);
  const newState = obj(accepted.newState);
  const newSession = obj(newState.session);
  const expectedWireAnswer = facade.startsWith('ui-')
    ? { ui: [{ CandidateCard: { props: { text: 'Ordinary complete' } } }] }
    : facade.startsWith('structured-')
      ? { answer: 'Ordinary complete' }
      : 'Ordinary complete';
  const expectedPublicAnswer = facade.startsWith('ui-')
    ? candidateResolvedUiAnswer('Ordinary complete')
    : expectedWireAnswer;
  const ordinaryText =
    typeof expectedWireAnswer === 'string'
      ? expectedWireAnswer
      : JSON.stringify(expectedWireAnswer);
  const checkInput = (
    candidate: Record<string, unknown>,
    thread: string,
    messages?: unknown[],
  ) => {
    assert.equal(candidate.threadId, thread);
    assert.deepEqual(candidate.tools, configuration.tools);
    assert.deepEqual(candidate.forwardedProps, configuration.forwardedProps);
    assert.deepEqual(candidate.context, originalRequest.context);
    assert.deepEqual(candidate.state ?? null, originalRequest.state ?? null);
    assert.ok(
      !Object.hasOwn(candidate, 'resume'),
      'Ordinary input must not resume',
    );
    const list = arr(candidate.messages);
    if (messages)
      assert.deepEqual(
        list,
        messages,
        'Chat ordinary input must append the canonical prefix',
      );
    else {
      assert.equal(
        list.length,
        2,
        'Completion replacement must contain only system and one user',
      );
      const system = obj(list[0]);
      assert.equal(system.role, 'system');
      assert.equal(system.content, configuration.system);
      text(system.id);
      assert.ok(
        !Object.hasOwn(system, 'toolCalls') &&
          !Object.hasOwn(system, 'toolCallId'),
      );
    }
    const user = obj(list.at(-1));
    assert.equal(user.role, 'user');
    assert.equal(user.content, root.prompt);
    text(user.id);
    assert.ok(
      !Object.hasOwn(user, 'toolCalls') && !Object.hasOwn(user, 'toolCallId'),
    );
  };
  const baselineProxyRejections = arr(baseline.proxyRejections);
  assert.deepEqual(
    arr(after.proxyRejections),
    baselineProxyRejections,
    'Global proxy refusal evidence changed',
  );
  const unchanged = (snapshot: Record<string, unknown>) => {
    assert.deepEqual(
      arr(snapshot.proxyRejections),
      baselineProxyRejections,
      'Global proxy refusal evidence changed',
    );
    assert.deepEqual(
      snapshot.state,
      baseline.state,
      'Original native authority changed',
    );
    assert.deepEqual(
      snapshot.witnesses,
      baseline.witnesses,
      'Original native witnesses changed',
    );
    assert.deepEqual(
      snapshot.observer,
      baseline.observer,
      'Whole browser observer evidence changed',
    );
  };
  let expectedOldRuns = arr(baseline.runs);
  if (completion) {
    const rejected = obj(root.rejected);
    const rejectedRequest = obj(rejected.request);
    const rejectedInput = obj(rejectedRequest.input);
    const rejectedReceipt = obj(rejected.receipt);
    const rejectedPublic = obj(rejected.publicState);
    const rejectedAfter = obj(rejected.after);
    const baselineCounts = obj(baseline.counts);
    const rejectedCounts = obj(rejectedAfter.counts);
    for (const counts of [baselineCounts, rejectedCounts])
      for (const count of Object.values(counts))
        assert.ok(
          typeof count === 'number' &&
            Number.isSafeInteger(count) &&
            count >= 0,
          'Actual native stage counts must be nonnegative safe integers',
        );
    for (const stage of [
      'Create.Forward',
      'Create.Completed',
      'Deserialize.Forward',
      'Deserialize.Completed',
      'Run.Forward',
      'Serialize.Forward',
      'Serialize.Completed',
      'Evidence.Start',
      'Reserve.Start',
      'Reserve.Committed',
      'Admission.Completed',
      'Executable.Typed.Admitted',
      'Transport.Typed.Admitted',
      'Public.Admitted',
      'Recovery.Provider.Projected',
      'Native.Result.Observed',
      'reservation-attempt',
      'reservation-success',
      'cold-acquire-attempt',
      'cold-acquire-success',
      'save-success',
    ])
      assert.equal(
        rejectedCounts[stage] ?? 0,
        baselineCounts[stage] ?? 0,
        'Refused ordinary request reached forbidden native stage: ' + stage,
      );
    const rejectedRunId = text(rejectedInput.runId);
    const rejectedProxyId = text(rejectedRequest.requestId);
    checkInput(rejectedInput, oldThread);
    assert.notEqual(runId, rejectedRunId);
    assert.notEqual(proxyId, rejectedProxyId);
    assert.equal(rejectedRequest.status, 400);
    assert.equal(rejectedReceipt.requestId, rejectedProxyId);
    assert.equal(rejectedReceipt.upstreamStatus, 400);
    assert.equal(rejectedReceipt.deliveredStatus, 400);
    assert.equal(rejectedReceipt.bodyText, '');
    assert.equal(rejectedReceipt.bodyBase64, '');
    assert.deepEqual(rejectedReceipt.sourceEvents, []);
    assert.deepEqual(rejectedReceipt.deliveredEvents, []);
    assert.ok(
      number(rejectedReceipt.requestSeq) < number(rejectedReceipt.headersSeq),
    );
    assert.ok(
      number(rejectedReceipt.headersSeq) < number(rejectedReceipt.completeSeq),
    );
    assert.equal(rejectedPublic.threadId, oldThread);
    assert.equal(rejectedPublic.pending, null);
    assert.equal(rejectedPublic.isLoading, false);
    assert.equal(rejectedPublic.isResuming, false);
    assert.equal(obj(rejectedPublic.recovery).required, false);
    assert.deepEqual(rejectedPublic.events, []);
    if (typeof rejectedPublic.error === 'string')
      assert.equal(rejectedPublic.error, 'TransportError: Bad Request (400)');
    else {
      const error = obj(rejectedPublic.error);
      assert.equal(error.name, 'TransportError');
      assert.equal(error.message, 'Bad Request (400)');
    }
    assert.equal(rejectedPublic.localError, null);
    assert.equal(rejectedPublic.lastAction, 'next');
    const lifecycle = arr(rejectedPublic.transport).map(obj);
    assert.deepEqual(
      lifecycle.map((item) => item.kind),
      ['started', 'error', 'disposed'],
    );
    for (const item of lifecycle) assert.equal(item.requestId, rejectedRunId);
    unchanged(rejectedAfter);
    assert.equal(rejectedAfter.providerCount, baseline.providerCount);
    expectedOldRuns = [...expectedOldRuns, rejectedRequest];
    assert.deepEqual(rejectedAfter.runs, expectedOldRuns);
    const navigation = obj(root.navigation);
    assert.equal(navigation.control, 'new-thread');
    assert.equal(navigation.fromThreadId, oldThread);
    assert.equal(navigation.toThreadId, targetThread);
    assert.notEqual(targetThread, oldThread);
    const beforeUrl = new URL(text(navigation.beforeUrl));
    const afterUrl = new URL(text(navigation.afterUrl));
    assert.equal(beforeUrl.origin, afterUrl.origin);
    const beforeConfig = obj(
      JSON.parse(text(beforeUrl.searchParams.get('config'))),
    );
    const afterConfig = obj(
      JSON.parse(text(afterUrl.searchParams.get('config'))),
    );
    assert.equal(beforeConfig.threadId, oldThread);
    assert.deepEqual(
      afterConfig,
      { ...beforeConfig, threadId: targetThread },
      'Explicit navigation changed trusted configuration',
    );
    beforeUrl.searchParams.delete('config');
    afterUrl.searchParams.delete('config');
    assert.equal(beforeUrl.href, afterUrl.href);
    assert.ok(
      number(rejectedReceipt.monotonicMs) < number(navigation.startedMs),
    );
    assert.ok(number(navigation.startedMs) <= number(navigation.completedMs));
    assert.ok(number(navigation.completedMs) < number(receipt.monotonicMs));
    const status = obj(navigation.status);
    assert.equal(status.facade, facade);
    assert.equal(status.threadId, targetThread);
    assert.equal(status.pending, null);
    assert.ok(
      status.pendingInterrupts === null ||
        status.pendingInterrupts === undefined,
    );
    assert.ok(status.output === null || status.output === undefined);
    assert.equal(status.isLoading, false);
    assert.equal(status.isResuming, false);
    assert.equal(obj(status.recovery).required, false);
    assert.deepEqual(status.events, []);
    assert.deepEqual(status.transport, []);
    assert.deepEqual(navigation.runs, expectedOldRuns);
    assert.equal(navigation.providerCount, baseline.providerCount);
    unchanged(after);
    assert.deepEqual(after.runs, expectedOldRuns);
    assert.deepEqual(
      arr(accepted.newRuns),
      [request],
      'Fresh selector must retain exactly its sole accepted request',
    );
    assert.equal(
      number(accepted.currentProviderCount),
      number(baseline.providerCount) + 1,
      'Current provider total changed after ordinary qualification',
    );
    checkInput(input, targetThread);
  } else {
    assert.ok(
      !Object.hasOwn(root, 'navigation') && !Object.hasOwn(root, 'rejected'),
      'Chat ordinary qualification must remain on its retained thread',
    );
    assert.equal(targetThread, oldThread);
    const messages = arr(input.messages);
    assert.equal(messages.length, originalMessages.length + 1);
    checkInput(input, oldThread, [...originalMessages, messages.at(-1)]);
    assert.deepEqual(after.runs, [...expectedOldRuns, request]);
    assert.deepEqual(after.state, newState);
    assert.deepEqual(after.witnesses, baseline.witnesses);
    assert.deepEqual(after.observer, baseline.observer);
  }
  assert.equal(request.status, 200);
  assert.equal(receipt.requestId, proxyId);
  assert.equal(receipt.upstreamStatus, 200);
  assert.equal(receipt.deliveredStatus, 200);
  assert.ok(number(receipt.requestSeq) < number(receipt.headersSeq));
  const source = arr(receipt.sourceEvents).map(obj);
  assert.deepEqual(
    receipt.deliveredEvents,
    source,
    'Actual source/delivered ordinary protocol differs',
  );
  for (const type of ['RUN_STARTED', 'RUN_FINISHED']) {
    const matching = source.filter((item) => item.type === type);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].runId, runId);
    assert.equal(matching[0].threadId, targetThread);
  }
  assert.equal(source[0].type, 'RUN_STARTED');
  assert.equal(source.at(-1)?.type, 'RUN_FINISHED');
  assert.ok(
    source.every(
      (item) =>
        ![
          'RUN_ERROR',
          'TOOL_CALL_START',
          'TOOL_CALL_ARGS',
          'TOOL_CALL_END',
          'TOOL_CALL_RESULT',
        ].includes(String(item.type)),
    ),
  );
  assert.equal(
    source
      .filter((item) => item.type === 'TEXT_MESSAGE_CONTENT')
      .map((item) => item.delta)
      .join(''),
    ordinaryText,
  );
  assert.equal(publicState.threadId, targetThread);
  assert.equal(publicState.pending, null);
  assert.equal(publicState.isLoading, false);
  assert.equal(publicState.isResuming, false);
  assert.equal(publicState.error, null);
  assert.equal(obj(publicState.recovery).required, false);
  const publicEvents = arr(publicState.events).map(obj);
  for (const type of ['RUN_STARTED', 'RUN_FINISHED']) {
    const matching = publicEvents.filter((item) => item.type === type);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].runId, runId);
    assert.equal(matching[0].requestId, runId);
  }
  const lifecycle = arr(publicState.transport).map(obj);
  assert.deepEqual(
    lifecycle.map((item) => item.kind),
    lifecycle.some((item) => item.kind === 'complete')
      ? ['started', 'disposed', 'complete']
      : ['started', 'disposed'],
  );
  for (const item of lifecycle) assert.equal(item.requestId, runId);
  if (facade === 'completion' || facade === 'structured-completion')
    assert.deepEqual(publicState.output, expectedPublicAnswer);
  else if (facade === 'ui-completion') {
    const output = obj(publicState.output);
    assert.equal(output.role, 'assistant');
    text(output.id);
    assert.deepEqual(output.content, expectedPublicAnswer);
    if (publicState.rawOutput !== undefined)
      assert.deepEqual(publicState.rawOutput, expectedPublicAnswer);
    if (publicState.value !== undefined)
      assert.deepEqual(obj(publicState.value).content, expectedPublicAnswer);
  } else
    assert.ok(
      arr(publicState.messages).some((item) => {
        const message = obj(item);
        return (
          message.role === 'assistant' &&
          JSON.stringify(message.content) ===
            JSON.stringify(expectedPublicAnswer)
        );
      }),
    );
  if (facade.startsWith('ui-'))
    assert.ok(arr(accepted.renderedText).includes('Ordinary complete'));
  assert.equal(after.providerCount, number(baseline.providerCount) + 1);
  assert.equal(newSession.selector, targetThread);
  assert.equal(newSession.state, 'Ready');
  assert.equal(newSession.ever_saved, true);
  assert.equal(newSession.token, null);
  assert.equal(newSession.lease_until, null);
  assert.equal(newSession.admitted_request, null);
  const payload = obj(JSON.parse(text(newSession.payload)));
  assert.equal(payload.turnCompleted, true);
  assert.deepEqual(payload.pendingCalls, []);
  assert.deepEqual(payload.expectedBrowserCallIds, []);
  assert.equal(obj(payload.approvals).pendingBatch, null);
  const saved = obj(JSON.parse(text(payload.publicRequest)));
  assert.ok(!Object.hasOwn(saved, 'runId'));
  const { runId: ignoredRun, ...submitted } = input;
  void ignoredRun;
  const { messages: savedMessages, ...savedConfiguration } = saved;
  const { messages: submittedMessages, ...submittedConfiguration } = submitted;
  if (
    submittedConfiguration.state === null &&
    !Object.hasOwn(savedConfiguration, 'state')
  )
    delete submittedConfiguration.state;
  assert.deepEqual(savedConfiguration, submittedConfiguration);
  const savedHistory = arr(savedMessages);
  assert.equal(savedHistory.length, arr(submittedMessages).length + 1);
  assert.deepEqual(savedHistory.slice(0, -1), submittedMessages);
  const finalMessage = obj(savedHistory.at(-1));
  const starts = source.filter((item) => item.type === 'TEXT_MESSAGE_START');
  assert.equal(starts.length, 1);
  assert.equal(finalMessage.id, starts[0].messageId);
  assert.equal(finalMessage.role, 'assistant');
  assert.equal(finalMessage.content, ordinaryText);
  assert.ok(
    finalMessage.name === undefined || finalMessage.name === 'HashbrownNative',
  );
  assert.ok(
    Object.keys(finalMessage).every((key) =>
      ['id', 'role', 'content', 'name'].includes(key),
    ),
  );
  if (completion) {
    assert.deepEqual(newState.effects, []);
    assert.deepEqual(newState.invocations, []);
    assert.deepEqual(newState.members, []);
    assert.deepEqual(newState.batches, []);
  } else assert.deepEqual(newState.effects, originalState.effects);
  assert.deepEqual(accepted.newWitnesses, []);
  const provider = obj(accepted.provider);
  assertCandidateFacadeSchema(facade, root.api, configuration, [provider]);
  assertCandidateProviderTextHistory(
    provider,
    root.api,
    arr(input.messages).map(obj),
  );
}

/** Live membership evidence read only after an owned ordinary journey has drained. */
export interface CandidateOrdinaryCurrentEvidence {
  readonly runs: readonly unknown[];
  readonly providerCount: number;
  readonly proxyRejections: readonly unknown[];
  readonly newRuns?: readonly unknown[];
}

/** Refreshes live membership at invocation while preserving captured protocol facts and the original authority baseline. */
export function refreshCandidateOrdinaryThreadQualification(
  original: Readonly<Record<string, unknown>>,
  readCurrent: () => CandidateOrdinaryCurrentEvidence,
): Record<string, unknown> {
  assert.ok(candidateAcceptanceObject(original.accepted));
  const accepted = original.accepted;
  assert.ok(candidateAcceptanceObject(accepted.after));
  assert.ok(typeof original.facade === 'string');
  const current = readCurrent();
  return {
    ...original,
    accepted: {
      ...accepted,
      after: {
        ...accepted.after,
        runs: [...current.runs],
        providerCount: current.providerCount,
        proxyRejections: [...current.proxyRejections],
      },
      ...(original.facade.endsWith('completion')
        ? {
            newRuns: current.newRuns ? [...current.newRuns] : undefined,
            currentProviderCount: current.providerCount,
          }
        : {}),
    },
  };
}
