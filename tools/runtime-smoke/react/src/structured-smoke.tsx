import { s } from '@hashbrownai/core';
import { useStructuredChat } from '@hashbrownai/react';
import { useState } from 'react';

const answerSchema = s.object('Runtime smoke answer', {
  answer: s.streaming.string('Answer text'),
  count: s.number('Result count'),
});

function readRetries(): number {
  const value = Number.parseInt(
    new URL(globalThis.location.href).searchParams.get('retries') ?? '0',
    10,
  );

  return Math.min(1, Math.max(0, Number.isNaN(value) ? 0 : value));
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** React structured chat fixture used by the shared runtime smoke scenario. */
export function StructuredSmoke() {
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState('');
  const {
    error,
    generatingError,
    isLoading,
    lastAssistantMessage,
    sendMessage,
    sendingError,
    stop,
  } = useStructuredChat({
    system: 'Runtime smoke system prompt.',
    schema: answerSchema,
    retries: readRetries(),
  });
  const answer = lastAssistantMessage?.content?.answer ?? '';
  const count = lastAssistantMessage?.content?.count ?? '';

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
      <div data-testid="error">{errorText(error)}</div>
      <div data-testid="sending-error">{errorText(sendingError)}</div>
      <div data-testid="generating-error">{errorText(generatingError)}</div>
      <div data-testid="tool-count">0</div>
      <div data-testid="structured-answer">{answer}</div>
      <div data-testid="structured-count">{count}</div>
    </section>
  );
}
