import { useChat } from '@hashbrownai/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createWorkbenchStore } from '../../runtime/workbench';
import { createProductionClient } from '../../runtime/workbench-production-client';
import { mountProductionControls } from '../../runtime/workbench-production-controls';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';
import { PRODUCTION_INITIAL_STATE } from '../../runtime/workbench-production';

/** Runs real server-pinned Hashbrown requests with explicit durable recovery. */
export function ProductionWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [store] = useState(() => createWorkbenchStore('workflow'));
  const [transport] = useState(() =>
    createWorkbenchTransport(store, undefined, '/api/production/run'),
  );
  const chat = useChat({
    system: '', // An empty SDK system creates no configured system overlay; the server pins instructions.
    state: PRODUCTION_INITIAL_STATE,
    transport,
  });
  const latest = useRef({ chat, active, navigation });
  useLayoutEffect(() => {
    latest.current = { chat, active, navigation };
  });
  const [client] = useState(() =>
    createProductionClient(
      store,
      () => ({
        revision: latest.current.chat.recovery.revision,
        busy: latest.current.chat.isLoading || latest.current.chat.isResuming,
        pending: latest.current.chat.pendingInterrupts,
        error: latest.current.chat.error,
        recoveryRequired: latest.current.chat.recovery.required,
        finishReason: latest.current.chat.lastRunFinishReason,
        restore: (snapshot, options) =>
          latest.current.chat.restoreConversation(snapshot, options),
        resume: (options) => latest.current.chat.resume(options),
      }),
      () => latest.current.active,
      undefined,
      () => window.localStorage,
    ),
  );
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  useEffect(() => {
    if (!host.current) return;
    client.mount();
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson: getWorkbenchLesson(window.location.search),
      send: (content) => {
        if (!client.sendable()) return;
        const message = store.send(content);
        client.ran();
        try {
          latest.current.chat.sendMessage(message);
        } catch {
          store.settle('error');
        }
      },
      stop: () => {
        if (client.mutable() || store.getSnapshot().status === 'loading')
          stopWorkbench(store, latest.current.chat);
      },
      reset: () => latest.current.navigation.create(),
    });
    mounted.current = shell;
    const dispose = mountProductionControls(shell.live, store, client);
    return () => {
      client.dispose();
      stopWorkbench(store, latest.current.chat);
      dispose();
      shell.dispose();
    };
  }, [store, client]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation]);
  useLayoutEffect(() => {
    if (!active) {
      stopWorkbench(store, chat);
      mounted.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    store.recordWorkflow({
      state: chat.state,
      messages: chat.messages,
      pendingInterrupts: chat.pendingInterrupts,
      isLoading: chat.isLoading,
      isResuming: chat.isResuming,
      error: chat.error,
      finishReason: chat.lastRunFinishReason,
      recoveryRequired: chat.recovery.required,
    });
    client.observe();
    if (
      store.getSnapshot().status === 'loading' &&
      !chat.isLoading &&
      !chat.isResuming &&
      !chat.pendingInterrupts &&
      (chat.error || chat.lastRunFinishReason || chat.recovery.required)
    )
      store.settle(
        chat.error || chat.recovery.required ? 'error' : 'complete',
        chat.lastRunFinishReason,
      );
  }, [
    chat.state,
    chat.messages,
    chat.pendingInterrupts,
    chat.isLoading,
    chat.isResuming,
    chat.error,
    chat.lastRunFinishReason,
    chat.recovery.required,
    store,
    client,
  ]);
  return <div ref={host} />;
}
