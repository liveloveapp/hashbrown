import {
  type ComponentFallbackProps,
  type JsonResolvedValue,
  s,
} from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import { Fragment, type ReactNode, useState } from 'react';
import { InterruptControls } from './interrupt-controls';
import { useRecoveryControls, useRecoveryThread } from './recovery-controls';
import { rememberThread } from './recovery';

interface RuntimeStatusProps {
  readonly title: string;
  readonly count: number;
}

function RuntimeStatus({ title, count }: RuntimeStatusProps) {
  const [actions, setActions] = useState(0);

  return (
    <section>
      <div data-testid="status-card">{`${title}: ${count}`}</div>
      <button
        data-testid="status-action"
        type="button"
        onClick={() => setActions((value) => value + 1)}
      >
        Acknowledge
      </button>
      <span data-testid="status-action-count">{actions}</span>
    </section>
  );
}

function partialTitle(
  partialProps: Record<string, JsonResolvedValue> | undefined,
): string {
  const title = partialProps?.['title'];

  return typeof title === 'string' ? title : '';
}

function RuntimeStatusFallback({ partialProps }: ComponentFallbackProps) {
  return <div data-testid="status-card">{partialTitle(partialProps)}</div>;
}

/** Container used only by the opt-in nested UI scenario. */
function RuntimePanel({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <section data-testid="nested-panel">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

const statusComponent = exposeComponent(RuntimeStatus, {
  name: 'status',
  description: 'Display a runtime status.',
  fallback: RuntimeStatusFallback,
  props: {
    title: s.streaming.string('Status title'),
    count: s.number('Status count'),
  },
  children: false,
});
const panelComponent = exposeComponent(RuntimePanel, {
  name: 'panel',
  description: 'Group a status inside a panel.',
  props: { heading: s.string('Panel heading') },
  children: [statusComponent],
});
const components =
  new URL(globalThis.location.href).searchParams.get('nested') === 'true'
    ? [panelComponent]
    : [statusComponent];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** React generative UI fixture used by the shared runtime smoke scenario. */
export function UiSmoke() {
  const [prompt, setPrompt] = useState('');
  const { threadId, setThreadId } = useRecoveryThread();
  const [submitted, setSubmitted] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [toolCount, setToolCount] = useState(0);
  const native =
    new URL(globalThis.location.href).searchParams.get('native') === 'true';
  const selectItem = useTool({
    name: 'selectItem',
    description: 'Select a fixture item.',
    schema: s.object('Item selection', {
      itemId: s.string('Item ID'),
    }),
    handler: async ({ itemId }) => {
      setSelectedItem(itemId);
      setToolCount((count) => count + 1);
      return { itemId };
    },
    deps: [],
  });
  const chat = useUiChat({
    system: 'Runtime smoke system prompt.',
    threadId,
    components,
    tools: native ? [selectItem] : [],
  });
  const recovery = useRecoveryControls(chat, threadId, setThreadId);
  const {
    error,
    generatingError,
    isLoading,
    messages,
    sendMessage,
    sendingError,
    stop,
  } = chat;

  function send() {
    rememberThread(threadId);
    setSubmitted(prompt);
    sendMessage({ role: 'user', content: prompt });
  }

  return (
    <section>
      <input
        data-testid="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        data-testid="send"
        type="button"
        disabled={recovery.disabled}
        onClick={send}
      >
        Send
      </button>
      <button data-testid="stop" type="button" onClick={() => stop()}>
        Stop
      </button>
      <InterruptControls
        disabled={recovery.disabled}
        batch={chat.pendingInterrupts}
        isResuming={chat.isResuming}
        resume={chat.resume}
      />
      {recovery.enabled && (
        <button
          data-testid="refresh-recovery"
          disabled={recovery.fetching || isLoading}
          onClick={() => void recovery.refresh()}
        >
          Refresh recovery
        </button>
      )}
      <button data-testid="new-thread" onClick={recovery.newThread}>
        New thread
      </button>
      <div data-testid="recovery-status">{recovery.status}</div>
      <div data-testid="recovery-fetching">{String(recovery.fetching)}</div>
      <div data-testid="recovery-required">
        {String(chat.recovery.required)}
      </div>
      <div data-testid="recovery-thread">{threadId}</div>
      {chat.recovery.diagnostics?.map((diagnostic) => (
        <pre
          key={diagnostic.messageId}
          data-testid="recovery-diagnostic"
          data-message-id={diagnostic.messageId}
          data-thread-id={diagnostic.threadId}
          data-kind={diagnostic.kind}
        >
          {diagnostic.content}
        </pre>
      ))}
      <div data-testid="status">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="user-message">{submitted}</div>
      <div data-testid="assistant"></div>
      {messages.map((message, index) => {
        if (message.role === 'activity') {
          return (
            <div
              key={index}
              data-testid={`activity-${message.activityType}`}
              data-activity-id={message.id}
            >
              {JSON.stringify(message.content)}
            </div>
          );
        }

        return message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null;
      })}
      <div data-testid="error">{errorText(error)}</div>
      <div data-testid="sending-error">{errorText(sendingError)}</div>
      <div data-testid="generating-error">{errorText(generatingError)}</div>
      <div data-testid="tool-count">{toolCount}</div>
      {native && (
        <div data-testid="selection-grid" style={{ display: 'grid' }}>
          <span data-testid="selected-item">{selectedItem}</span>
        </div>
      )}
      <div data-testid="structured-answer"></div>
      <div data-testid="structured-count"></div>
    </section>
  );
}
