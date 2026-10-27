import type {
  ConversationRecoveryConfiguration,
  ConversationRecoveryState,
  ConversationRestoreOptions,
  ConversationSnapshot,
} from '@hashbrownai/core';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  fixtureCredential,
  readRecovery,
  recoveryBlocked,
  recoveryEndpoint,
  recoveryOrigin,
  recoveryStatus,
  rememberThread,
  selectedThread,
} from './recovery';

interface RecoverableChat {
  readonly recovery: ConversationRecoveryState;
  getRecoveryConfiguration(): ConversationRecoveryConfiguration;
  restoreConversation(
    snapshot: ConversationSnapshot,
    options: ConversationRestoreOptions,
  ): void;
}

/** Owns only a stable thread selector and explicit guarded recovery UI state. */
export function useRecoveryThread() {
  const [threadId, setThreadId] = useState(selectedThread);
  return { threadId, setThreadId };
}

/** Fetches server-owned history on an explicit action without replaying an approval or model run. */
export function useRecoveryControls(
  chat: RecoverableChat,
  threadId: string,
  setThreadId: (value: string) => void,
) {
  const enabled = Boolean(recoveryOrigin());
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState('');
  const [lastRestore, setLastRestore] = useState<(() => void) | undefined>();
  const [commandError, setCommandError] = useState('');
  const [blocked, setBlocked] = useState(
    () =>
      enabled && new URL(globalThis.location.href).searchParams.has('threadId'),
  );
  const generation = useRef(0);
  const revision = useRef(chat.recovery.revision);
  useLayoutEffect(() => {
    revision.current = chat.recovery.revision;
  }, [chat.recovery.revision]);
  useLayoutEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  async function refresh() {
    const requestGeneration = ++generation.current;
    const expectedRevision = chat.recovery.revision;
    const current = () =>
      generation.current === requestGeneration &&
      revision.current === expectedRevision;
    setFetching(true);
    setBlocked(true);
    try {
      const configuration = chat.getRecoveryConfiguration();
      const response = await fetch(
        recoveryEndpoint(threadId),
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
        setLastRestore(() => apply);
      }
      setStatus(recoveryStatus(envelope));
      setBlocked(recoveryBlocked(envelope));
    } catch (cause) {
      if (current())
        setStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === requestGeneration) setFetching(false);
    }
  }

  /** Replays only the last genuine public restore command to exercise stale revision refusal. */
  function replayLastRestore() {
    setCommandError('');
    try {
      lastRestore?.();
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function newThread() {
    generation.current++;
    const next = crypto.randomUUID();
    rememberThread(next);
    setFetching(false);
    setStatus('');
    setBlocked(false);
    setThreadId(next);
  }

  return {
    enabled,
    replayLastRestore,
    canReplayRestore: Boolean(lastRestore),
    commandError,
    fetching,
    status,
    disabled: fetching || blocked || (enabled && chat.recovery.required),
    refresh,
    newThread,
  };
}
