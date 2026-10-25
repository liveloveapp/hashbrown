import {
  computed,
  DestroyRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import type {
  ConversationRecoveryConfiguration,
  ConversationRecoveryState,
  ConversationRestoreOptions,
  ConversationSnapshot,
} from '@hashbrownai/core';
import {
  fixtureCredential,
  readRecovery,
  recoveryBlocked,
  recoveryOrigin,
  rememberThread,
} from '../recovery';

interface RecoverableChat {
  readonly recovery: Signal<ConversationRecoveryState>;
  getRecoveryConfiguration(): ConversationRecoveryConfiguration;
  restoreConversation(
    snapshot: ConversationSnapshot,
    options: ConversationRestoreOptions,
  ): void;
}

/** Creates explicit recovery controls; restoring history never authorizes an application action. */
export function createRecoveryControls(
  chat: RecoverableChat,
  threadId: Signal<string>,
  setThread: (value: string) => void,
) {
  const enabled = Boolean(recoveryOrigin());
  const fetching = signal(false);
  const status = signal('');
  const blocked = signal(
    enabled && new URL(globalThis.location.href).searchParams.has('threadId'),
  );
  let generation = 0;
  inject(DestroyRef).onDestroy(() => {
    generation++;
  });
  async function refresh() {
    const requestGeneration = ++generation;
    const expectedRevision = chat.recovery().revision;
    const selected = threadId();
    const current = () =>
      generation === requestGeneration &&
      threadId() === selected &&
      chat.recovery().revision === expectedRevision;
    fetching.set(true);
    blocked.set(true);
    try {
      const configuration = chat.getRecoveryConfiguration();
      const response = await fetch(
        `${recoveryOrigin()}/threads/${encodeURIComponent(selected)}/recovery`,
        fixtureCredential({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configuration),
        }),
      );
      if (!current()) return;
      if (!response.ok) throw new Error(`Recovery HTTP ${response.status}`);
      const envelope = readRecovery(await response.json());
      if (!current()) return;
      if (envelope.snapshot)
        chat.restoreConversation(envelope.snapshot, {
          expectedRevision,
          structuredHistory: 'preserve-diagnostics',
        });
      status.set(
        envelope.reconciliationOutcome
          ? `${envelope.disposition}: ${envelope.reconciliationOutcome}`
          : envelope.disposition,
      );
      blocked.set(recoveryBlocked(envelope));
    } catch (cause) {
      if (current())
        status.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation === requestGeneration) fetching.set(false);
    }
  }
  function newThread() {
    generation++;
    const next = crypto.randomUUID();
    rememberThread(next);
    fetching.set(false);
    status.set('');
    blocked.set(false);
    setThread(next);
  }
  return {
    enabled,
    fetching,
    status,
    disabled: computed(
      () => fetching() || blocked() || (enabled && chat.recovery().required),
    ),
    refresh,
    newThread,
  };
}
