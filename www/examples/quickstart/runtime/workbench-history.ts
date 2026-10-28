import type { WorkbenchAuthoringObservation } from './workbench-authoring';
import type { WorkbenchAgentTrace } from './workbench-agent';
import type { WorkbenchServerHistoryState } from './workbench-server-history';
import type { WorkbenchSnapshot } from './workbench';

/** A deliberately narrow application copy; SDK identifiers are never persisted. */
export interface WorkbenchTextDocument {
  readonly version: 1;
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }[];
}
/** Fixed application-owned slots, independent of SDK thread IDs. */
export type WorkbenchHistorySlot = 'Lighthouse' | 'Harbor';
/** Result of the last explicit storage operation; failures never imply an empty document. */
export interface WorkbenchHistoryRead {
  readonly status: 'empty' | 'valid' | 'invalid' | 'unavailable';
  readonly document: WorkbenchTextDocument | null;
  readonly error: string | null;
}
/** Separately captured application state; no field is an SDK checkpoint. */
export interface WorkbenchHistoryApp {
  readonly server?: WorkbenchServerHistoryState;
  readonly retained: WorkbenchTextDocument | null;
  readonly selectedSlot: WorkbenchHistorySlot;
  readonly saved: WorkbenchHistoryRead;
  readonly action: string | null;
  readonly error: string | null;
}
/** Actual SDK inputs accepted without depending on a framework-specific chat type. */
export interface WorkbenchHistoryObservationInput {
  readonly messages: readonly unknown[];
  readonly isLoading: boolean;
  readonly isSending?: boolean;
  readonly isReceiving?: boolean;
  readonly isGenerating?: boolean;
  readonly isResuming?: boolean;
  readonly finishReason?: string | null;
  readonly error?: unknown;
  readonly pendingInterrupts?: unknown;
  readonly recoveryRequired?: boolean;
}
/** Immutable SDK observation, including unsupported messages for honest inspection. */
export interface WorkbenchHistoryObservation {
  readonly messages: readonly Readonly<Record<string, unknown>>[];
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly isReceiving: boolean;
  readonly isGenerating: boolean;
  readonly isResuming: boolean;
  readonly finishReason: string | null;
  readonly error: string | null;
  readonly pendingInterrupts: unknown;
  readonly recoveryRequired: boolean;
}
/** Application intent awaiting actual SDK replacement; never a fabricated lifecycle flag. */
export type WorkbenchHistoryReplacement = 'clear' | 'restore' | 'load';
/** Paired capture keeps application text and SDK lifecycle distinct. */
export interface WorkbenchHistoryFrame {
  readonly authoring?: WorkbenchAuthoringObservation;
  readonly agent?: WorkbenchAgentTrace;
  readonly replacement: WorkbenchHistoryReplacement | null;
  readonly sdk: WorkbenchHistoryObservation;
  readonly app: WorkbenchHistoryApp;
  readonly successfulGeneration: boolean;
}
/** Minimal browser storage surface, injected so acquiring storage can also fail safely. */
export type WorkbenchHistoryStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const result = (
  status: WorkbenchHistoryRead['status'],
  document: WorkbenchTextDocument | null = null,
  error: string | null = null,
): WorkbenchHistoryRead => ({ status, document, error });

/** Validates the complete versioned text envelope, rejecting rather than truncating. */
export function decodeWorkbenchHistory(
  encoded: string,
): WorkbenchTextDocument | null {
  if (bytes(encoded) > 64000) return null;
  try {
    const value: unknown = JSON.parse(encoded);
    if (
      !record(value) ||
      Object.keys(value).some(
        (key) => !['version', 'messages'].includes(key),
      ) ||
      value['version'] !== 1 ||
      !Array.isArray(value['messages']) ||
      value['messages'].length > 40
    )
      return null;
    const messages = value['messages'];
    if (
      !messages.every(
        (message) =>
          record(message) &&
          Object.keys(message).every((key) =>
            ['role', 'content'].includes(key),
          ) &&
          (message['role'] === 'user' || message['role'] === 'assistant') &&
          typeof message['content'] === 'string' &&
          message['content'].length <= 2000,
      )
    )
      return null;
    if (
      messages.length &&
      (!messages.some((message) => message.role === 'user') ||
        messages.at(-1)?.role !== 'assistant' ||
        !messages.at(-1)?.content.trim())
    )
      return null;
    return {
      version: 1,
      messages: messages.map(({ role, content }) => ({ role, content })),
    };
  } catch {
    return null;
  }
}
/** Projects actual supported text messages; tool-bearing and non-text histories are rejected. */
export function encodeWorkbenchHistory(
  messages: readonly unknown[],
): string | null {
  if (
    !messages.every(
      (message) =>
        record(message) &&
        (message['role'] === 'user' || message['role'] === 'assistant') &&
        typeof message['content'] === 'string' &&
        ['toolCalls', 'serverToolCalls'].every(
          (key) =>
            message[key] === undefined ||
            (Array.isArray(message[key]) && message[key].length === 0),
        ),
    )
  )
    return null;
  const encoded = JSON.stringify({
    version: 1,
    messages: messages.map((message) => {
      const value = message as Record<string, unknown>;
      return { role: value['role'], content: value['content'] };
    }),
  });
  return decodeWorkbenchHistory(encoded) ? encoded : null;
}
/** Returns a namespaced key that never overlaps legacy standalone history examples. */
export function workbenchHistoryKey(slot: WorkbenchHistorySlot): string {
  return `hashbrown.workbench.saved-text.v1.${slot}`;
}
/** Reads a selected slot without writing or deleting invalid bytes. */
export function readWorkbenchHistory(
  getStorage: () => WorkbenchHistoryStorage,
  slot: WorkbenchHistorySlot,
): WorkbenchHistoryRead {
  try {
    const encoded = getStorage().getItem(workbenchHistoryKey(slot));
    if (encoded === null) return result('empty');
    const document = decodeWorkbenchHistory(encoded);
    return document
      ? result('valid', document)
      : result(
          'invalid',
          null,
          'Saved text is invalid. Clear this slot explicitly before saving.',
        );
  } catch (error) {
    return result('unavailable', null, errorText(error));
  }
}
/** Atomically writes valid text only after a successful fresh read of the selected slot. */
export function writeWorkbenchHistory(
  getStorage: () => WorkbenchHistoryStorage,
  slot: WorkbenchHistorySlot,
  document: WorkbenchTextDocument,
): WorkbenchHistoryRead {
  const current = readWorkbenchHistory(getStorage, slot);
  if (current.status === 'invalid' || current.status === 'unavailable')
    return current;
  const encoded = JSON.stringify(document);
  const validated = decodeWorkbenchHistory(encoded);
  if (!validated || !validated.messages.length)
    return result('invalid', null, 'Only complete nonempty text can be saved.');
  try {
    getStorage().setItem(workbenchHistoryKey(slot), encoded);
    return result('valid', validated);
  } catch (error) {
    return result('unavailable', current.document, errorText(error));
  }
}
/** Explicitly removes only the chosen application-owned slot. */
export function removeWorkbenchHistory(
  getStorage: () => WorkbenchHistoryStorage,
  slot: WorkbenchHistorySlot,
): WorkbenchHistoryRead {
  try {
    getStorage().removeItem(workbenchHistoryKey(slot));
    return result('empty');
  } catch (error) {
    return result('unavailable', null, errorText(error));
  }
}
/** Creates a fresh in-memory lesson state without reading browser storage. */
export function createWorkbenchHistoryApp(): WorkbenchHistoryApp {
  return {
    retained: null,
    selectedSlot: 'Lighthouse',
    saved: result('empty'),
    action: null,
    error: null,
  };
}
/** Copies actual SDK messages and every lifecycle guard, preserving arbitrary pending batches. */
export function normalizeWorkbenchHistoryObservation(
  input: WorkbenchHistoryObservationInput,
): WorkbenchHistoryObservation {
  return structuredClone({
    messages: input.messages.map((message) =>
      record(message) ? message : { unsupported: message },
    ),
    isLoading: input.isLoading,
    isSending: !!input.isSending,
    isReceiving: !!input.isReceiving,
    isGenerating: !!input.isGenerating,
    isResuming: !!input.isResuming,
    finishReason: input.finishReason ?? null,
    error: input.error == null ? null : errorText(input.error),
    pendingInterrupts: input.pendingInterrupts ?? null,
    recoveryRequired: !!input.recoveryRequired,
  });
}
/** Identifies actual SDK work, including the brief public setter sending transition. */
export function isWorkbenchHistoryBusy(
  sdk: WorkbenchHistoryObservation | undefined,
): boolean {
  return (
    !!sdk &&
    (sdk.isLoading ||
      sdk.isSending ||
      sdk.isReceiving ||
      sdk.isGenerating ||
      sdk.isResuming)
  );
}
/** Guards every application text mutation, including programmatic historical actions. */
export function canMutateWorkbenchHistory(
  snapshot: WorkbenchSnapshot,
): boolean {
  const sdk = snapshot.frame?.history?.sdk;
  return (
    !snapshot.frame?.history?.replacement &&
    snapshot.cursor === null &&
    snapshot.status !== 'loading' &&
    snapshot.status !== 'paused' &&
    !!sdk &&
    !sdk.isLoading &&
    !sdk.isSending &&
    !sdk.isReceiving &&
    !sdk.isGenerating &&
    !sdk.isResuming &&
    !sdk.error &&
    !sdk.pendingInterrupts &&
    !sdk.recoveryRequired
  );
}
/** Requires a newly completed successful generation; restored or idle text alone is insufficient. */
export function canSaveWorkbenchHistory(snapshot: WorkbenchSnapshot): boolean {
  const history = snapshot.frame?.history;
  return (
    canMutateWorkbenchHistory(snapshot) &&
    !!history?.successfulGeneration &&
    history.sdk.finishReason === 'stop' &&
    history.sdk.messages.length > 0 &&
    encodeWorkbenchHistory(history.sdk.messages) !== null
  );
}
/** Server-owned concise plain-text policy; the plan is explained, never executed. */
export const workbenchHistorySystem =
  'Explain the application-owned two-step plan briefly in plain text: 1. Outline the trusted UI demo. 2. Record the demo. Remember the plan name supplied in this conversation, Lighthouse or Harbor, and include it in replies. Follow-up answers keep that same name and the same outline/record steps. Use at most three short sentences. Do not execute steps or claim application state changed. No tools or generated UI.';
/** The checked history prompts used by both framework clients. */
export const workbenchHistoryPrompts = [
  'Name this two-step plan Lighthouse and explain it briefly.',
  'What is the name of this plan, and what is its second step?',
] as const;
