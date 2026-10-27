import type { WorkbenchStore } from './workbench';
import {
  canMutateWorkbenchHistory,
  canSaveWorkbenchHistory,
  createWorkbenchHistoryApp,
  decodeWorkbenchHistory,
  encodeWorkbenchHistory,
  isWorkbenchHistoryBusy,
  normalizeWorkbenchHistoryObservation,
  readWorkbenchHistory,
  removeWorkbenchHistory,
  type WorkbenchHistoryApp,
  type WorkbenchHistoryObservationInput,
  type WorkbenchHistorySlot,
  type WorkbenchHistoryStorage,
  writeWorkbenchHistory,
} from './workbench-history';

/** Records real SDK transitions; replacement observations never complete a generation. */
export function observeHistory(
  store: WorkbenchStore,
  observation: WorkbenchHistoryObservationInput,
): void {
  const previous = store.getSnapshot().frame?.history;
  const replacement = previous?.replacement;
  const wasBusy = isWorkbenchHistoryBusy(previous?.sdk);
  const accepted = store.recordHistory(observation);
  const sdk = normalizeWorkbenchHistoryObservation(observation);
  if (
    accepted &&
    !replacement &&
    store.getSnapshot().status === 'loading' &&
    !isWorkbenchHistoryBusy(sdk) &&
    !sdk.pendingInterrupts &&
    (wasBusy || sdk.error || sdk.finishReason || sdk.recoveryRequired)
  )
    store.settle(
      sdk.error || sdk.recoveryRequired || sdk.finishReason !== 'stop'
        ? 'error'
        : 'complete',
      sdk.finishReason,
    );
}

/** Binds explicit application text actions to guarded real SDK replacement and browser storage. */
export function createHistoryActions(
  store: WorkbenchStore,
  observation: () => WorkbenchHistoryObservationInput,
  setMessages: (
    messages: (
      | { role: 'user'; content: string }
      | { role: 'assistant'; content: string; toolCalls: [] }
    )[],
  ) => void,
  getStorage: () => WorkbenchHistoryStorage,
  active: () => boolean,
) {
  const mutable = () => {
    const sdk = normalizeWorkbenchHistoryObservation(observation());
    return (
      active() &&
      canMutateWorkbenchHistory(store.getSnapshot()) &&
      !isWorkbenchHistoryBusy(sdk) &&
      !sdk.error &&
      !sdk.pendingInterrupts &&
      !sdk.recoveryRequired
    );
  };
  const savable = () =>
    mutable() &&
    observation().finishReason === 'stop' &&
    canSaveWorkbenchHistory(store.getSnapshot());
  const app = () =>
    store.getSnapshot().frame?.history?.app ?? createWorkbenchHistoryApp();
  const record = (next: WorkbenchHistoryApp, action: string) =>
    store.recordHistoryApp(next, action);
  return {
    mutable,
    savable,
    /** Allows a fresh prompt after an ordinary request error while guarding actual active work. */
    sendable() {
      const snapshot = store.getSnapshot();
      const sdk = normalizeWorkbenchHistoryObservation(observation());
      return (
        active() &&
        snapshot.cursor === null &&
        snapshot.status !== 'loading' &&
        snapshot.status !== 'paused' &&
        !snapshot.frame?.history?.replacement &&
        !isWorkbenchHistoryBusy(sdk) &&
        !sdk.pendingInterrupts &&
        !sdk.recoveryRequired
      );
    },
    /** Captures a thrown send action as an application failure without inventing SDK observations. */
    failSend(error: unknown) {
      store.settle('error');
      record(
        {
          ...app(),
          error: error instanceof Error ? error.message : String(error),
        },
        'send-failed',
      );
    },
    /** Reads only the explicitly selected slot after browser mounting or user selection. */
    select(slot: WorkbenchHistorySlot) {
      if (!mutable() || !['Lighthouse', 'Harbor'].includes(slot)) return;
      const saved = readWorkbenchHistory(getStorage, slot);
      record(
        { ...app(), selectedSlot: slot, saved, error: saved.error },
        'select-slot',
      );
    },
    /** Retains a versioned text copy only from a newly completed successful generation. */
    keep() {
      if (!savable()) return;
      const encoded = encodeWorkbenchHistory(observation().messages);
      if (encoded)
        record(
          { ...app(), retained: decodeWorkbenchHistory(encoded), error: null },
          'keep',
        );
    },
    /** Writes the chosen slot only on an explicit successful-generation-gated action. */
    save() {
      if (!savable()) return;
      const encoded = encodeWorkbenchHistory(observation().messages);
      const document = encoded && decodeWorkbenchHistory(encoded);
      if (!document) return;
      const saved = writeWorkbenchHistory(
        getStorage,
        app().selectedSlot,
        document,
      );
      record({ ...app(), saved, error: saved.error }, 'save');
    },
    /** Explicitly clears only the selected application slot. */
    clearSlot() {
      if (!mutable()) return;
      const saved = removeWorkbenchHistory(getStorage, app().selectedSlot);
      record({ ...app(), saved, error: saved.error }, 'clear-slot');
    },
    /** Claims replacement intent before the public setter and handles synchronous rejection. */
    replace(action: 'clear' | 'restore' | 'load') {
      if (!mutable()) return;
      let current = app();
      if (action === 'load') {
        const saved = readWorkbenchHistory(getStorage, current.selectedSlot);
        current = { ...current, saved, error: saved.error };
        record(current, 'read-before-load');
        if (saved.status !== 'valid') return;
      }
      const source =
        action === 'restore'
          ? current.retained
          : action === 'load'
            ? current.saved.document
            : { version: 1, messages: [] };
      const document = source && decodeWorkbenchHistory(JSON.stringify(source));
      if (!document || (action === 'clear' && !observation().messages.length))
        return;
      if (!document.messages.length && !observation().messages.length) {
        record({ ...current, error: null }, `${action}-unchanged`);
        return;
      }
      if (!record({ ...current, error: null }, action)) return;
      const messages = document.messages.map((message) =>
        message.role === 'assistant'
          ? { ...message, role: 'assistant' as const, toolCalls: [] as [] }
          : { ...message, role: 'user' as const },
      );
      try {
        setMessages(messages);
      } catch (error) {
        store.failHistoryReplacement(error);
      }
    },
  };
}
