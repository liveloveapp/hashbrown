import {
  workbenchBrowserInstructions,
  workbenchConversationSystem,
} from '../../runtime/workbench-onboarding';
import { MagicTextRenderer, useChat, useTool } from '@hashbrownai/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isCurrentWorkbenchError } from '../../runtime/workbench';
import { workbenchApplicationInput } from '../../runtime/workbench-recipe-input';
import { workbenchTextSystem } from '../../runtime/workbench-recipes';
import { getWorkbenchLesson } from '../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../runtime/workbench-transport';
import {
  messageOrigins,
  type ProposalOrigin,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../runtime/workbench-view';
import { useRecipeWorkbench } from './RecipeWorkbenchShell';

/** Explains the fixed plan through actual chat and renders captured Markdown with Magic Text. */
export function MagicTextWorkbenchConversation({
  active,
  navigation,
}: {
  readonly active: boolean;
  readonly navigation: WorkbenchNavigation;
}) {
  const lesson = getWorkbenchLesson(window.location.search);
  const plain =
    lesson.id === 'conversation' || lesson.id === 'system-instructions';
  const { store, snapshot, host, live, commands } = useRecipeWorkbench(
    'text',
    active,
    navigation,
  );
  const [transport] = useState(() =>
    createWorkbenchTransport(
      store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
  );
  const [users, setUsers] = useState<Readonly<Record<string, ProposalOrigin>>>(
    {},
  );
  const previousError = useRef<unknown>(undefined);
  const recorded = useRef('');
  const requestId = useRef('');
  const readContext = useTool({
    name: 'readContext',
    description:
      'Read the application-owned plan and revision. Never changes application state.',
    handler: async () => {
      const result = workbenchApplicationInput(store.getSnapshot().application);
      store.record('tool', { name: 'readContext', result });
      return result;
    },
    deps: [store],
  });
  const chat = useChat({
    system:
      lesson.id === 'system-instructions'
        ? workbenchBrowserInstructions
        : plain
          ? workbenchConversationSystem
          : workbenchTextSystem,
    tools: plain ? [] : [readContext],
    transport,
  });
  const origins = messageOrigins(chat.messages, users);
  useLayoutEffect(() => {
    const stop = () => stopWorkbench(store, chat);
    commands.current = {
      send: (content) => {
        previousError.current = chat.error;
        const user = store.send(content);
        requestId.current = user.id;
        const current = store.getSnapshot();
        setUsers((previous) => ({
          ...previous,
          [user.id]: {
            turn: current.turn,
            revision: current.application.revision,
          },
        }));
        recorded.current = '';
        chat.sendMessage(user);
      },
      stop,
      reset: () => {
        stop();
        chat.setMessages([]);
        setUsers({});
        recorded.current = '';
        requestId.current = '';
      },
    };
  });
  useEffect(() => {
    const current = store.getSnapshot();
    if (current.status !== 'loading') return;
    if (
      chat.error &&
      isCurrentWorkbenchError(
        current,
        chat.messages,
        chat.error,
        previousError.current,
      )
    ) {
      store.settle('error');
      return;
    }
    if (chat.error) return;
    const message = chat.lastAssistantMessage;
    if (!message || origins[message.id]?.turn !== current.turn) return;
    if (
      typeof message.content === 'string' &&
      message.content !== recorded.current
    ) {
      recorded.current = message.content;
      store.recordRecipe(
        { kind: 'text', markdown: message.content },
        requestId.current,
      );
    }
    if (!chat.isLoading && chat.lastRunFinishReason)
      store.settle(
        chat.lastRunFinishReason === 'stop' && !chat.pendingInterrupts
          ? 'complete'
          : 'error',
        chat.lastRunFinishReason,
      );
  }, [
    chat.lastAssistantMessage,
    chat.messages,
    chat.error,
    chat.isLoading,
    chat.lastRunFinishReason,
    chat.pendingInterrupts,
    origins,
    store,
  ]);
  const messages = snapshot.frame?.messages ?? [];
  return (
    <>
      <div ref={host} />
      {live &&
        createPortal(
          <>
            {messages.map((message) =>
              message.role === 'user' ? (
                <p key={message.id} className="wb-user">
                  {message.content}
                </p>
              ) : (
                <article
                  key={message.id}
                  className="wb-summary wb-markdown"
                  aria-label={
                    plain ? 'Plain text response' : 'Markdown explanation'
                  }
                >
                  {plain ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {message.recipe?.kind === 'text'
                        ? message.recipe.markdown
                        : message.content}
                    </p>
                  ) : (
                    <MagicTextRenderer
                      isComplete={
                        snapshot.frame?.status !== 'loading' ||
                        message.id !== messages.at(-1)?.id
                      }
                      caret={
                        snapshot.cursor === null &&
                        snapshot.status === 'loading' &&
                        message.id === messages.at(-1)?.id
                      }
                      onLinkClick={(event) => event.preventDefault()}
                      onCitationClick={(event, citation) => {
                        event.preventDefault();
                        if (store.getSnapshot().cursor === null && citation.url)
                          store.inspectCitation(
                            {
                              id: citation.id,
                              number: Number(citation.number),
                              url: citation.url,
                            },
                            message.id,
                          );
                      }}
                    >
                      {message.recipe?.kind === 'text'
                        ? message.recipe.markdown
                        : message.content}
                    </MagicTextRenderer>
                  )}
                </article>
              ),
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'error' && (
              <p role="alert">
                The explanation failed. Send a message to try again.
              </p>
            )}
            {(snapshot.frame?.status ?? snapshot.status) === 'cancelled' && (
              <p role="status">
                Explanation stopped. Partial text is retained; send a message to
                continue.
              </p>
            )}
          </>,
          live,
        )}
    </>
  );
}
