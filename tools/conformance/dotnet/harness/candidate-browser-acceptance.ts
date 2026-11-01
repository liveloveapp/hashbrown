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
  readonly records: readonly Readonly<{
    kind: string;
    requestId: string;
    reason?: string;
    bytes: Uint8Array;
  }>[];
  readonly events: readonly Readonly<{ type: string; runId: string }>[];
  readonly transport: readonly Readonly<{
    kind: string;
    abortSource?: string;
  }>[];
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
  for (const fault of records.filter((record) => record.kind === 'fault'))
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
