import {
  type ComponentFallbackProps,
  type JsonResolvedValue,
  s,
} from '@hashbrownai/core';
import { exposeComponent, useUiChat } from '@hashbrownai/react';
import { Fragment, useState } from 'react';

interface RuntimeStatusProps {
  readonly title: string;
  readonly count: number;
}

function RuntimeStatus({ title, count }: RuntimeStatusProps) {
  return <div data-testid="status-card">{`${title}: ${count}`}</div>;
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

const components = [
  exposeComponent(RuntimeStatus, {
    name: 'status',
    description: 'Display a runtime status.',
    fallback: RuntimeStatusFallback,
    props: {
      title: s.streaming.string('Status title'),
      count: s.number('Status count'),
    },
    children: false,
  }),
];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** React generative UI fixture used by the shared runtime smoke scenario. */
export function UiSmoke() {
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState('');
  const {
    error,
    generatingError,
    isLoading,
    messages,
    sendMessage,
    sendingError,
    stop,
  } = useUiChat({
    system: 'Runtime smoke system prompt.',
    components,
  });

  function send() {
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
      <button data-testid="send" type="button" onClick={send}>
        Send
      </button>
      <button data-testid="stop" type="button" onClick={() => stop()}>
        Stop
      </button>
      <div data-testid="status">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="user-message">{submitted}</div>
      <div data-testid="assistant"></div>
      {messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
      <div data-testid="error">{errorText(error)}</div>
      <div data-testid="sending-error">{errorText(sendingError)}</div>
      <div data-testid="generating-error">{errorText(generatingError)}</div>
      <div data-testid="tool-count">0</div>
      <div data-testid="structured-answer"></div>
      <div data-testid="structured-count"></div>
    </section>
  );
}
