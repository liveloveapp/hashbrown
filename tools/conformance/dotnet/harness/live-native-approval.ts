/** Bounded primitive native approval facts; raw native identities never cross this projection. */
export interface LiveNativeApprovalProof {
  readonly nativeApprovalStage:
    'pending' | 'approved' | 'followup' | 'invalid' | 'starting';
  readonly nativeApprovalWirePhase: number;
  readonly nativeApprovalCaptures: number;
  readonly nativeApprovalAdmissions: number;
  readonly nativeApprovalDispatches: number;
  readonly nativeApprovalCompletions: number;
  readonly nativeApprovalPublications: number;
  readonly nativeApprovalModelPhase: number;
  readonly nativeApprovalOriginalResults: number;
  readonly nativeApprovalAdmittedGeneration: number;
  readonly nativeApprovalAdmittedRevision: number;
  readonly nativeApprovalPendingEffects: number;
  readonly nativeApprovalFinalEffects: number;
  readonly nativeApprovalPendingObserved: boolean;
  readonly nativeApprovalBindingMatched: boolean;
  readonly nativeApprovalJournalMatched: boolean;
}

/** Reviewed cardinalities and enums shared by parser, ledger and persistence. */
export const LIVE_NATIVE_APPROVAL_FIELDS = Object.freeze({
  nativeApprovalWirePhase: 3,
  nativeApprovalCaptures: 1,
  nativeApprovalAdmissions: 1,
  nativeApprovalDispatches: 1,
  nativeApprovalCompletions: 1,
  nativeApprovalPublications: 3,
  nativeApprovalModelPhase: 3,
  nativeApprovalOriginalResults: 1,
  nativeApprovalAdmittedGeneration: Number.MAX_SAFE_INTEGER,
  nativeApprovalAdmittedRevision: Number.MAX_SAFE_INTEGER,
  nativeApprovalPendingEffects: 1,
  nativeApprovalFinalEffects: 1,
});

/** Parses only complete bounded facts; malformed required fields cannot disappear into successful evidence. */
export function parseLiveNativeApprovalProof(
  value: Readonly<Record<string, unknown>>,
): LiveNativeApprovalProof {
  const stage = value['nativeApprovalStage'];
  if (
    typeof stage !== 'string' ||
    !['starting', 'pending', 'approved', 'followup', 'invalid'].includes(
      String(stage),
    )
  )
    throw new Error('LIVE_APPROVAL_PROOF_INVALID');
  const safe: Record<string, unknown> = { nativeApprovalStage: stage };
  for (const [key, maximum] of Object.entries(LIVE_NATIVE_APPROVAL_FIELDS)) {
    const number = value[key];
    if (
      typeof number !== 'number' ||
      !Number.isSafeInteger(number) ||
      number < 0 ||
      number > maximum
    )
      throw new Error('LIVE_APPROVAL_PROOF_INVALID');
    safe[key] = number;
  }
  for (const key of [
    'nativeApprovalPendingObserved',
    'nativeApprovalBindingMatched',
    'nativeApprovalJournalMatched',
  ]) {
    if (typeof value[key] !== 'boolean')
      throw new Error('LIVE_APPROVAL_PROOF_INVALID');
    safe[key] = value[key];
  }
  return Object.freeze(safe) as unknown as LiveNativeApprovalProof;
}

/** Requires the only reviewed successful three-phase sequence, complete usage and exact selected authentication. */
export function validLiveNativeApproval(
  stats: Readonly<Record<string, unknown>>,
  counters: Readonly<Record<string, unknown>>,
  authentication: 'api-key' | 'bearer',
): boolean {
  try {
    const proof = parseLiveNativeApprovalProof(stats);
    return (
      proof.nativeApprovalWirePhase === 3 &&
      proof.nativeApprovalStage === 'followup' &&
      proof.nativeApprovalCaptures === 1 &&
      proof.nativeApprovalAdmissions === 1 &&
      proof.nativeApprovalDispatches === 1 &&
      proof.nativeApprovalCompletions === 1 &&
      proof.nativeApprovalPublications === 3 &&
      proof.nativeApprovalModelPhase === 3 &&
      proof.nativeApprovalOriginalResults === 1 &&
      proof.nativeApprovalAdmittedGeneration > 0 &&
      proof.nativeApprovalAdmittedRevision > 0 &&
      proof.nativeApprovalPendingEffects === 0 &&
      proof.nativeApprovalFinalEffects === 1 &&
      proof.nativeApprovalPendingObserved &&
      proof.nativeApprovalBindingMatched &&
      proof.nativeApprovalJournalMatched &&
      stats['calls'] === 3 &&
      stats['httpCalls'] === 3 &&
      stats['usageCompleteCalls'] === 3 &&
      stats['usageIncompleteCalls'] === 0 &&
      counters['durableNative'] === 0 &&
      counters['durableProtected'] === 0 &&
      counters['durableNativeProtected'] === 1 &&
      counters['server'] === 0 &&
      counters['protected'] === 1 &&
      Array.isArray(stats['wire']) &&
      stats['wire'].length === 3 &&
      stats['wire'].every((fact) => fact?.authentication === authentication)
    );
  } catch {
    return false;
  }
}

/** Genuine fixed result of FixtureTools.LookupProtectedNativeAirport for this one PDX scenario. */
export const LIVE_NATIVE_AIRPORT_RESULT = Object.freeze({
  code: 'PDX',
  name: 'Portland International Airport',
});

/** Compares the actual public JSON result value; IDs alone cannot prove result projection correctness. */
function nativeAirportResultMatches(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const result = JSON.parse(value) as unknown;
    if (!result || typeof result !== 'object' || Array.isArray(result))
      return false;
    const row = result as Record<string, unknown>;
    return (
      Object.keys(row).length === 2 &&
      row['code'] === LIVE_NATIVE_AIRPORT_RESULT.code &&
      row['name'] === LIVE_NATIVE_AIRPORT_RESULT.name
    );
  } catch {
    return false;
  }
}

/** Requires a bijection from one actual public call/result event to the retained original public call/result contents. */
export function validLivePublicApprovalResult(
  events: readonly Readonly<Record<string, unknown>>[],
  messages: readonly Readonly<Record<string, unknown>>[],
  callId: string,
  parent: string,
): boolean {
  try {
    const starts = events.filter(
      (event) => event['type'] === 'TOOL_CALL_START',
    );
    const results = events.filter(
      (event) => event['type'] === 'TOOL_CALL_RESULT',
    );
    const ends = events.filter((event) => event['type'] === 'TOOL_CALL_END');
    if (
      starts.length !== 1 ||
      results.length !== 1 ||
      ends.length !== 1 ||
      starts[0]['toolCallId'] !== callId ||
      starts[0]['toolCallName'] !== 'lookupAirport' ||
      (starts[0]['parentMessageId'] ?? `assistant-${callId}`) !== parent ||
      results[0]['toolCallId'] !== callId ||
      ends[0]['toolCallId'] !== callId ||
      !nativeAirportResultMatches(results[0]['content'])
    )
      return false;
    const calls = messages.flatMap((message) =>
      Array.isArray(message['toolCalls'])
        ? message['toolCalls'].map((call: unknown) => ({
            call: call as Record<string, unknown>,
            message,
          }))
        : [],
    );
    const retainedResults = messages.filter(
      (message) => message['role'] === 'tool',
    );
    if (
      calls.length !== 1 ||
      retainedResults.length !== 1 ||
      calls[0].message['role'] !== 'assistant' ||
      calls[0].message['id'] !== parent ||
      calls[0].call['id'] !== callId ||
      retainedResults[0]['toolCallId'] !== callId ||
      !nativeAirportResultMatches(retainedResults[0]['content'])
    )
      return false;
    const fn = calls[0].call['function'] as Record<string, unknown>;
    if (fn['name'] !== 'lookupAirport' || typeof fn['arguments'] !== 'string')
      return false;
    const args = JSON.parse(fn['arguments']) as Record<string, unknown>;
    return (
      !!args &&
      typeof args === 'object' &&
      !Array.isArray(args) &&
      Object.keys(args).length === 1 &&
      args['code'] === 'PDX'
    );
  } catch {
    return false;
  }
}
