import { LIVE_BUDGET_MANIFEST, LIVE_CASE_COUNT } from '../harness/live-budget';
import { createLiveQualificationLedger } from '../harness/live-qualification';
import {
  LIVE_NATIVE_APPROVAL_FIELDS,
  parseLiveNativeApprovalProof,
  validLiveNativeApproval,
} from '../harness/live-native-approval';
import { nativeApprovalUnitEvidence } from './fixtures/live-native-approval';

test('only the reviewed three real-phase shape qualifies native approval parser fixtures', () => {
  const { stats, counters } = nativeApprovalUnitEvidence();
  const ledger = createLiveQualificationLedger();

  const accepted = ledger.recordFixture(
    'react-openai-key',
    'native-approval',
    stats,
    counters,
  );

  expect(accepted).toBe(true);
  expect(ledger.snapshot()).toMatchObject({
    completedFixtures: 1,
    actualPassedCases: 0,
  });
  expect(() => ledger.assertComplete()).toThrow(
    'LIVE_QUALIFICATION_INCOMPLETE',
  );
  expect(LIVE_CASE_COUNT).toBe(54);
  expect(LIVE_BUDGET_MANIFEST.reservedCalls).toBe(123);
});

test('native approval rejects missing malformed application-only synthetic or four-call proof', () => {
  const { stats, counters } = nativeApprovalUnitEvidence();
  const mutations: Readonly<Record<string, unknown>>[] = [
    { nativeApprovalStage: undefined },
    { nativeApprovalStage: { toString: () => 'followup' } },
    { nativeApprovalStage: 'synthetic-fallback' },
    { nativeApprovalStage: 'approved' },
    { nativeApprovalPendingObserved: false },
    { nativeApprovalBindingMatched: false },
    { nativeApprovalJournalMatched: false },
    { nativeApprovalAdmissions: 0 },
    { nativeApprovalCaptures: 0 },
    { nativeApprovalCompletions: 0 },
    { nativeApprovalDispatches: 2 },
    { nativeApprovalWirePhase: 0 },
    { nativeApprovalWirePhase: 4 },
    { nativeApprovalPublications: 2 },
    { nativeApprovalModelPhase: 2 },
    { nativeApprovalOriginalResults: 2 },
    { nativeApprovalAdmittedGeneration: 0 },
    { nativeApprovalAdmittedRevision: -1 },
    { nativeApprovalFinalEffects: 2 },
    { nativeApprovalPendingEffects: 1 },
    { calls: 0 },
    { calls: 1 },
    { calls: 2 },
    { calls: 4, httpCalls: 4 },
    { calls: 5 },
    { httpCalls: 2 },
    { usageCompleteCalls: undefined },
    { usageIncompleteCalls: undefined },
    { usageCompleteCalls: 2, usageIncompleteCalls: 1 },
    { inputTokens: NaN },
    { outputTokens: -1 },
    { inputTokens: Number.MAX_SAFE_INTEGER + 1 },
    {
      nativeApprovalStage: undefined,
      nativeCoEmission: true,
      nativeExactHistory: true,
    },
  ];

  for (const mutation of mutations) {
    const ledger = createLiveQualificationLedger();
    expect(
      ledger.recordFixture(
        'react-openai-key',
        'native-approval',
        { ...stats, ...mutation },
        counters,
      ),
    ).toBe(false);
    expect(ledger.snapshot().invalid).toBe(true);
  }
});

test('native approval requires exact Responses wire path successful headers and durable protected effects', () => {
  const { stats, counters } = nativeApprovalUnitEvidence();
  const badWire = [
    { status: 0 },
    { status: 401 },
    { status: 500 },
    { path: '/openai/v1/responses' },
    { authentication: 'api-key' },
    { authentication: 'missing' },
    { maxOutputTokens: 385 },
    { store: true },
  ];

  for (const wire of badWire) {
    const ledger = createLiveQualificationLedger();
    expect(
      ledger.recordFixture(
        'react-openai-key',
        'native-approval',
        {
          ...stats,
          wire: [{ ...stats.wire[0], ...wire }, ...stats.wire.slice(1)],
        },
        counters,
      ),
    ).toBe(false);
  }
  for (const mutation of [
    { durableNativeProtected: 0 },
    { durableNativeProtected: 2 },
    { durableNative: 1 },
    { durableProtected: 1 },
    { server: 1 },
    { protected: 0 },
  ]) {
    expect(
      validLiveNativeApproval(stats, { ...counters, ...mutation }, 'bearer'),
    ).toBe(false);
  }
});

test('native proof parser rejects every missing field and invalid cardinality or primitive', () => {
  const { proof } = nativeApprovalUnitEvidence();

  for (const key of Object.keys(proof))
    expect(() =>
      parseLiveNativeApprovalProof({ ...proof, [key]: undefined }),
    ).toThrow('LIVE_APPROVAL_PROOF_INVALID');
  for (const [key, maximum] of Object.entries(LIVE_NATIVE_APPROVAL_FIELDS))
    for (const value of [
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      maximum + 1,
    ])
      expect(() =>
        parseLiveNativeApprovalProof({ ...proof, [key]: value }),
      ).toThrow('LIVE_APPROVAL_PROOF_INVALID');
  expect(
    parseLiveNativeApprovalProof({ ...proof, rawId: 'discarded-canary' }),
  ).toEqual(proof);
});

test('public approval result acceptance requires actual SSE payload and retained canonical contents', async () => {
  const { validLivePublicApprovalResult, LIVE_NATIVE_AIRPORT_RESULT } =
    await import('../harness/live-native-approval');
  const content = JSON.stringify(LIVE_NATIVE_AIRPORT_RESULT);
  const events = [
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'original',
      toolCallName: 'lookupAirport',
      parentMessageId: 'parent',
    },
    { type: 'TOOL_CALL_END', toolCallId: 'original' },
    { type: 'TOOL_CALL_RESULT', toolCallId: 'original', content },
  ];
  const messages = [
    {
      id: 'parent',
      role: 'assistant',
      toolCalls: [
        {
          id: 'original',
          function: { name: 'lookupAirport', arguments: '{"code":"PDX"}' },
        },
      ],
    },
    { role: 'tool', toolCallId: 'original', content },
  ];

  const accepted = validLivePublicApprovalResult(
    events,
    messages,
    'original',
    'parent',
  );

  expect(accepted).toBe(true);
  for (const wrong of [
    'wrong public result',
    JSON.stringify({ code: 'PDX', name: 'wrong' }),
    JSON.stringify({
      code: 'PDX',
      name: 'Portland International Airport',
      extra: true,
    }),
    '"airport:PDX"',
  ]) {
    expect(
      validLivePublicApprovalResult(
        events.map((event) =>
          event.type === 'TOOL_CALL_RESULT'
            ? { ...event, content: wrong }
            : event,
        ),
        messages,
        'original',
        'parent',
      ),
    ).toBe(false);
    expect(
      validLivePublicApprovalResult(
        events,
        [{ ...messages[0] }, { ...messages[1], content: wrong }],
        'original',
        'parent',
      ),
    ).toBe(false);
  }
  for (const fn of [
    { name: 'wrong', arguments: '{"code":"PDX"}' },
    { name: 'lookupAirport', arguments: '{"code":"LAX"}' },
  ]) {
    expect(
      validLivePublicApprovalResult(
        events,
        [
          { ...messages[0], toolCalls: [{ id: 'original', function: fn }] },
          messages[1],
        ],
        'original',
        'parent',
      ),
    ).toBe(false);
  }
  expect(
    validLivePublicApprovalResult(
      [...events, events[2]],
      messages,
      'original',
      'parent',
    ),
  ).toBe(false);
  expect(
    validLivePublicApprovalResult(
      events,
      [...messages, messages[1]],
      'original',
      'parent',
    ),
  ).toBe(false);
});
