import { useChat } from '@hashbrownai/react';
import { useState } from 'react';
import { createLocalMediaContent } from './local-transport';

/** Opt-in generated media fixture rendered through the React chat hook. */
export function LocalMedia() {
  const [commandError, setCommandError] = useState('');
  const chat = useChat({
    system: 'Follow the user instruction. Return only the requested answer.',
  });
  function send() {
    setCommandError('');
    try {
      chat.sendMessage({ role: 'user', content: createLocalMediaContent() });
    } catch (cause) {
      setCommandError(String(cause));
    }
  }
  const error = chat.error ?? chat.sendingError ?? chat.generatingError;

  return (
    <section>
      <button data-testid="send" type="button" onClick={send}>
        Send generated media
      </button>
      <button data-testid="stop" type="button" onClick={() => chat.stop()}>
        Stop
      </button>
      <div data-testid="assistant">
        {chat.lastAssistantMessage?.content ?? ''}
      </div>
      <div data-testid="status">{chat.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="error">
        {commandError || (error === undefined ? '' : String(error))}
      </div>
    </section>
  );
}
