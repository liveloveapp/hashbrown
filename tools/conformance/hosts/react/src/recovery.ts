import type { ConversationSnapshot } from '@hashbrownai/core';

/** Client-visible portion of the recipe's versioned recovery envelope. */
export interface RecoveryEnvelope {
  readonly schemaVersion: 1;
  readonly disposition: string;
  readonly serverRevision?: number;
  readonly reconciliationOutcome?: string;
  readonly reason?: 'PendingMixedBrowserResult';
  readonly snapshot?: ConversationSnapshot;
}

/** Reads the explicitly enabled fixture recovery origin. */
export function recoveryOrigin(): string | undefined {
  return (
    new URL(globalThis.location.href).searchParams.get('recoveryUrl') ??
    undefined
  );
}

/** Selects the explicitly configured read-only recovery protocol. */
export function recoveryEndpoint(threadId: string): string {
  const native =
    new URL(globalThis.location.href).searchParams.get('recoveryMode') ===
    'native';
  return `${recoveryOrigin()}/threads/${encodeURIComponent(threadId)}/${native ? 'native-session' : 'recovery'}`;
}

/** Returns a selector only; local interrupt ownership is never persisted. */
export function selectedThread(): string {
  const parameters = new URL(globalThis.location.href).searchParams;
  return recoveryOrigin()
    ? (parameters.get('threadId') ?? crypto.randomUUID())
    : crypto.randomUUID();
}

/** Records the thread in the endpoint/scenario-scoped URL for reload and second-tab tests. */
export function rememberThread(threadId: string): void {
  if (!recoveryOrigin()) return;
  const url = new URL(globalThis.location.href);
  url.searchParams.set('threadId', threadId);
  globalThis.history.replaceState(null, '', url);
}

/** Fixture-only authentication; production recipes use the application's real session. */
export function fixtureCredential(request: RequestInit): RequestInit {
  const principal = new URL(globalThis.location.href).searchParams.get(
    'fixturePrincipal',
  );
  if (!principal) return request;
  const headers = new Headers(request.headers);
  headers.set('X-Fixture-Principal', principal);
  return { ...request, headers };
}

/** Fails closed on unknown protocol versions or malformed envelope metadata. */
export function readRecovery(value: unknown): RecoveryEnvelope {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('disposition' in value) ||
    typeof value.disposition !== 'string'
  ) {
    throw new Error('Unsupported recovery envelope');
  }
  const envelope = value as RecoveryEnvelope;
  const known = [
    'Pending',
    'NativePendingBrowserResults',
    'Busy',
    'Expired',
    'UnknownEffect',
    'AmbiguousEffect',
    'CompletedAnswerUnavailable',
    'Completed',
    'Declined',
    'FailedBeforeEffect',
    'Reconciled',
  ];
  const outcomes = [
    'ConfirmedPerformed',
    'ConfirmedNotPerformed',
    'Unresolved',
  ];
  if (
    !known.includes(envelope.disposition) ||
    (envelope.reason != null &&
      (envelope.reason !== 'PendingMixedBrowserResult' ||
        envelope.disposition !== 'Pending')) ||
    (envelope.disposition === 'Reconciled'
      ? !outcomes.includes(envelope.reconciliationOutcome ?? '')
      : envelope.reconciliationOutcome != null)
  ) {
    throw new Error('Unsupported recovery envelope');
  }
  if (
    envelope.disposition === 'NativePendingBrowserResults' ||
    envelope.reason === 'PendingMixedBrowserResult'
  ) {
    return { ...envelope, snapshot: undefined };
  }
  return envelope;
}

/** Preserves the application's action gate independently from restored assistant history. */
export function recoveryBlocked(envelope: RecoveryEnvelope): boolean {
  return (
    !envelope.snapshot ||
    [
      'Busy',
      'UnknownEffect',
      'AmbiguousEffect',
      'NativePendingBrowserResults',
    ].includes(envelope.disposition) ||
    envelope.reconciliationOutcome === 'Unresolved'
  );
}

/** Explains blocked native browser recovery while retaining the existing fresh-thread action. */
export function recoveryStatus(envelope: RecoveryEnvelope): string {
  if (envelope.reason === 'PendingMixedBrowserResult')
    return 'Pending browser work cannot be restored. Start a new thread.';
  return envelope.reconciliationOutcome
    ? `${envelope.disposition}: ${envelope.reconciliationOutcome}`
    : envelope.disposition;
}
