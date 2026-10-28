/** Synthetic parser fixture only; never evidence of provider/native success. */
export function nativeApprovalUnitEvidence() {
  const proof = {
    nativeApprovalWirePhase: 3,
    nativeApprovalStage: 'followup',
    nativeApprovalCaptures: 1,
    nativeApprovalAdmissions: 1,
    nativeApprovalDispatches: 1,
    nativeApprovalCompletions: 1,
    nativeApprovalPublications: 3,
    nativeApprovalModelPhase: 3,
    nativeApprovalOriginalResults: 1,
    nativeApprovalAdmittedGeneration: 2,
    nativeApprovalAdmittedRevision: 6,
    nativeApprovalPendingEffects: 0,
    nativeApprovalFinalEffects: 1,
    nativeApprovalPendingObserved: true,
    nativeApprovalBindingMatched: true,
    nativeApprovalJournalMatched: true,
  };
  const stats = {
    ...proof,
    calls: 3,
    httpCalls: 3,
    cancelledCalls: 0,
    inputTokens: 30,
    outputTokens: 9,
    usageCompleteCalls: 3,
    usageIncompleteCalls: 0,
    stage: 'completed',
    wire: Array.from({ length: 3 }, () => ({
      method: 'POST',
      path: '/v1/responses',
      authentication: 'bearer',
      maxOutputTokens: 384,
      store: false,
      status: 200,
    })),
  };
  const counters = {
    server: 0,
    protected: 1,
    durableProtected: 0,
    durableNative: 0,
    durableNativeProtected: 1,
  };
  return { proof, stats, counters };
}
