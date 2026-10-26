import { s } from '@hashbrownai/core';
import { useStructuredChat } from '@hashbrownai/react';
import { useState } from 'react';
import { createLocalMediaContent } from './local-transport';

const schema = s.object('Image answer', {
  answer: s.string('Foreground square color in lowercase'),
  count: s.number('Number of foreground squares'),
});

/** Explicit WebLLM image fixture with fresh threads and parsed schema output. */
export function LocalVision() {
  const [thread, setThread] = useState(0);
  const [commandError, setCommandError] = useState('');
  const chat = useStructuredChat({
    threadId: `vision-thread-${thread}`,
    system:
      'Answer from the latest image only. Return the requested JSON object.',
    schema,
  });
  const error = chat.error ?? chat.sendingError ?? chat.generatingError;
  function send() {
    setCommandError('');
    try {
      chat.sendMessage({ role: 'user', content: createLocalMediaContent() });
    } catch (error) {
      setCommandError(String(error));
    }
  }
  return (
    <section>
      <button
        data-testid="new-thread"
        type="button"
        onClick={() => {
          setCommandError('');
          chat.setMessages([]);
          setThread((value) => value + 1);
        }}
      >
        New thread
      </button>
      <button data-testid="send" type="button" onClick={send}>
        Send generated image
      </button>
      <button data-testid="stop" type="button" onClick={() => chat.stop()}>
        Stop
      </button>
      <div data-testid="structured-answer">
        {chat.lastAssistantMessage?.content?.answer ?? ''}
      </div>
      <div data-testid="structured-count">
        {chat.lastAssistantMessage?.content?.count ?? ''}
      </div>
      <div data-testid="status">{chat.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="error">
        {commandError || (error === undefined ? '' : String(error))}
      </div>
    </section>
  );
}
