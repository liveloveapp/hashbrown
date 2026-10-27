import { useChat, useJsonParser, useTool } from '@hashbrownai/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createWorkbenchStore } from '../../runtime/workbench';
import {
  observeAuthoring,
  workbenchAuthoringSchema,
  workbenchFormsSystem,
  workbenchParserSystem,
} from '../../runtime/workbench-authoring';
import {
  currentAuthoringAssistant,
  mountAuthoringControls,
} from '../../runtime/workbench-authoring-controls';
import {
  createHistoryActions,
  observeHistory,
} from '../../runtime/workbench-history-client';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';

/** Runs actual text chat and parser hooks while explicit form actions own application writes. */
export function AuthoringWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const [lesson] = useState(() => getWorkbenchLesson(window.location.search));
  const [store] = useState(() =>
    createWorkbenchStore(
      'history',
      lesson.id === 'agent-decisions'
        ? {}
        : { authoringMode: lesson.id === 'natural-forms' ? 'form' : 'parser' },
    ),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [transport] = useState(() =>
    createWorkbenchTransport(store, undefined, lesson.endpoint),
  );
  const readContext = useTool({
    name: 'readContext',
    description:
      'Read the actual applied application plan and revision without changing state.',
    handler: async () => {
      const result = store.getSnapshot().application;
      store.record('tool', { name: 'readContext', result });
      return result;
    },
    deps: [store],
  });
  const chat = useChat({
    system:
      lesson.id === 'natural-forms'
        ? workbenchFormsSystem
        : lesson.id === 'agent-decisions'
          ? 'Explain the application-owned two-step plan through server-owned read-only routes.'
          : workbenchParserSystem,
    tools: lesson.id === 'natural-forms' ? [readContext] : [],
    transport,
  });
  const assistant = currentAuthoringAssistant(snapshot, chat.messages);
  const json = lesson.id === 'agent-decisions' ? '' : (assistant?.json ?? '');
  const parser = useJsonParser(json, workbenchAuthoringSchema);
  const observation = () => ({
    messages: chat.messages,
    isLoading: chat.isLoading,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
    isResuming: chat.isResuming,
    finishReason: chat.lastRunFinishReason,
    error: chat.error,
    pendingInterrupts: chat.pendingInterrupts,
    recoveryRequired: chat.recovery.required,
  });
  const actions = createHistoryActions(
    store,
    observation,
    (messages) => chat.setMessages(messages),
    () => window.localStorage,
    () => active,
  );
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<ReturnType<typeof mountWorkbench> | null>(null);
  const controls = useRef<ReturnType<typeof mountAuthoringControls> | null>(
    null,
  );
  const current = useRef({ active, navigation, chat, actions });
  useLayoutEffect(() => {
    current.current = { active, navigation, chat, actions };
  });
  useEffect(() => {
    if (!host.current) return;
    const shell = mountWorkbench(host.current, store, {
      framework: 'React',
      managedChat: true,
      lesson,
      send: (content) => {
        if (!current.current.actions.sendable()) return;
        const message = store.send(content);
        try {
          current.current.chat.sendMessage(message);
        } catch (error) {
          current.current.actions.failSend(error);
        }
      },
      stop: () => {
        if (current.current.active && store.getSnapshot().cursor === null)
          stopWorkbench(store, current.current.chat);
      },
      reset: () => current.current.navigation.create(),
    });
    mounted.current = shell;
    controls.current = mountAuthoringControls(
      shell.live,
      store,
      lesson.id,
      () => current.current.active,
    );
    shell.navigation(current.current.navigation);
    return () => {
      current.current.active = false;
      stopWorkbench(store, current.current.chat);
      controls.current?.dispose();
      shell.dispose();
      mounted.current = null;
    };
  }, [store, lesson]);
  useLayoutEffect(() => {
    if (!active) {
      stopWorkbench(store, chat);
      mounted.current?.pause();
    }
    controls.current?.render();
  }, [active]);
  useEffect(() => {
    mounted.current?.navigation(navigation);
  }, [navigation]);
  useEffect(() => {
    observeHistory(store, observation());
    if (lesson.id !== 'agent-decisions')
      observeAuthoring(store, {
        assistantId: assistant?.id ?? null,
        json,
        value: parser.value,
        complete: parser.parserState.complete,
        error: parser.error,
      });
  }, [
    store,
    lesson.id,
    chat.messages,
    chat.isLoading,
    chat.isSending,
    chat.isReceiving,
    chat.isGenerating,
    chat.isResuming,
    chat.lastRunFinishReason,
    chat.error,
    chat.pendingInterrupts,
    chat.recovery.required,
    assistant?.id,
    json,
    parser.value,
    parser.parserState.complete,
    parser.error,
  ]);
  return <div ref={host} />;
}
