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
  recoveryEndpoint,
  recoveryOrigin,
  recoveryStatus,
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
  const lastRestore = signal<(() => void) | undefined>(undefined);
  const commandError = signal('');
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
        recoveryEndpoint(selected),
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
      if (envelope.snapshot) {
        const snapshot = envelope.snapshot;
        const apply = () =>
          chat.restoreConversation(snapshot, {
            expectedRevision,
            structuredHistory: 'preserve-diagnostics',
          });
        apply();
        lastRestore.set(apply);
      }
      status.set(recoveryStatus(envelope));
      blocked.set(recoveryBlocked(envelope));
    } catch (cause) {
      if (current())
        status.set(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation === requestGeneration) fetching.set(false);
    }
  }
  /** Replays only the last genuine public restore command to exercise stale revision refusal. */
  function replayLastRestore() {
    commandError.set('');
    try {
      lastRestore()?.();
    } catch (cause) {
      commandError.set(cause instanceof Error ? cause.message : String(cause));
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
    replayLastRestore,
    canReplayRestore: computed(() => Boolean(lastRestore())),
    commandError,
    fetching,
    status,
    disabled: computed(
      () => fetching() || blocked() || (enabled && chat.recovery().required),
    ),
    refresh,
    newThread,
  };
}
