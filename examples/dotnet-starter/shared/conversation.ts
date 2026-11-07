import {
  type ConversationRecoveryConfiguration,
  type ConversationSnapshot,
  type JsonValue,
  type PendingConversationRecovery,
  type ResumeConversationRecoveryOptions,
  type ResumeEntry,
  s,
} from '@hashbrownai/core';
import { nativeDecisions } from './native-decisions.mjs';

/** Trusted system instructions, identical for ordinary runs and recovery validation. */
export const system =
  'Help with airports. Use lookupAirport for trusted server airport information and readBrowserNote to read the browser note. Never guess tool results. Respect declined approvals and unavailable results; never replay an unavailable action.';
/** Browser-owned read operation exposed to the model. */
export const noteSchema = s.object('Browser note request', {
  label: s.string('A short label for this note request'),
});
/** Server recovery wire envelope; authority remains with the runtime and server. */
export interface RecoveryEnvelope {
  readonly schemaVersion: 2;
  readonly disposition: string;
  readonly serverRevision: number;
  readonly snapshot?: ConversationSnapshot;
  readonly reason?: string;
}
/** An explicit browser outcome editor; unavailable never implies permission to rerun. */
export interface OutcomeChoice {
  readonly status: 'result' | 'unavailable';
  readonly json: string;
}
/** Selects a public thread identity without storing local approval/recovery ownership. */
export function selectedThread(): string {
  return (
    new URL(location.href).searchParams.get('threadId') || crypto.randomUUID()
  );
}
/** Saves only the public selector, permitting cold reload with a fresh runtime. */
export function rememberThread(threadId: string): void {
  const url = new URL(location.href);
  url.searchParams.set('threadId', threadId);
  history.replaceState(null, '', url);
}
/** Starts a fresh page/runtime and selector through an explicit user action. */
export function newConversation(): void {
  const url = new URL(location.href);
  url.searchParams.set('threadId', crypto.randomUUID());
  location.assign(url);
}
/** Converts parsed JSON to an owned, finite public JSON value. */
function jsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item)]),
    );
  throw Error('A finite JSON result is required.');
}
/** Reads an authoritative V2 snapshot without executing model or browser work. */
export async function readRecovery(
  threadId: string,
  configuration: ConversationRecoveryConfiguration,
): Promise<RecoveryEnvelope> {
  const response = await fetch(
    `/threads/${encodeURIComponent(threadId)}/recovery`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Hashbrown-Recovery-Version': '2',
        'Hashbrown-Starter': 'starter',
      },
      body: JSON.stringify(configuration),
    },
  );
  if (!response.ok) throw Error(`Recovery refused (${response.status}).`);
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 2 ||
    !('disposition' in value) ||
    typeof value.disposition !== 'string' ||
    !('serverRevision' in value) ||
    !Number.isSafeInteger(value.serverRevision) ||
    Number(value.serverRevision) < 0
  )
    throw Error('Unsupported recovery envelope.');
  if (
    ![
      'Pending',
      'Completed',
      'Busy',
      'UnknownEffect',
      'Expired',
      'Unavailable',
      'FailedBeforeEffect',
      'NativePendingBrowserResults',
    ].includes(value.disposition)
  )
    throw Error('Unknown recovery disposition.');
  // restoreConversation independently validates every canonical message and capability.
  return value as RecoveryEnvelope;
}
/** Builds all protected decisions together; local batch tokens are never persisted. */
export function decisions(
  interrupts: readonly { readonly id: string }[],
  decision: 'approve' | 'decline' | 'cancel',
): ResumeEntry[] {
  return nativeDecisions(interrupts, decision);
}
/** Explicitly settles every original browser call and genuine protected decision exactly once. */
export function settlement(
  pending: PendingConversationRecovery,
  choices: Readonly<Record<string, OutcomeChoice>>,
  decision: 'approve' | 'decline' | 'cancel',
): ResumeConversationRecoveryOptions {
  return {
    batchId: pending.id,
    outcomes: pending.toolCalls.map((call) => {
      const choice = choices[call.id];
      if (!choice)
        throw Error('Choose an outcome for every recovered browser call.');
      return choice.status === 'unavailable'
        ? { toolCallId: call.id, status: 'unavailable' as const }
        : {
            toolCallId: call.id,
            status: 'result' as const,
            value: jsonValue(JSON.parse(choice.json)),
          };
    }),
    entries: decisions(pending.interrupts, decision),
  };
}
/** Creates a read-only browser handler that waits for an explicit user action and respects cancellation. */
export function createBrowserReader(changed: (pending: boolean) => void) {
  let release: ((note: string) => void) | undefined;
  return {
    read: async (_args: { label: string }, signal: AbortSignal) => {
      const count =
        Number(sessionStorage.getItem('starter-browser-entries') ?? '0') + 1;
      sessionStorage.setItem('starter-browser-entries', String(count));
      return new Promise<{ note: string }>((resolve, reject) => {
        if (signal.aborted) {
          reject(Error('Browser read cancelled.'));
          return;
        }
        if (release) {
          reject(Error('Another browser read is pending.'));
          return;
        }
        const cleanup = () => {
          release = undefined;
          signal.removeEventListener('abort', abort);
          changed(false);
        };
        const abort = () => {
          cleanup();
          reject(Error('Browser read cancelled.'));
        };
        release = (note) => {
          cleanup();
          resolve({ note });
        };
        signal.addEventListener('abort', abort, { once: true });
        changed(true);
      });
    },
    release: (note: string) => release?.(note),
  };
}
