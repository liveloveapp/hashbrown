import { useState } from 'react';
import { useChat } from '@hashbrownai/react';

/** A text conversation that keeps earlier turns in the current chat instance. */
export function Conversation() {
  const [prompt, setPrompt] = useState(
    'My name is Sam. Say hello in one sentence.',
  );
  const chat = useChat({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    debugName: 'onboarding',
  });

  return (
    <main>
      <h1>A conversation with context</h1>
      <label htmlFor="prompt">Your message</label>
      <input
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={chat.isLoading || !prompt.trim()}
        onClick={() => {
          chat.sendMessage({ role: 'user', content: prompt });
          setPrompt('');
        }}
      >
        Send message
      </button>
      {chat.isLoading && <p role="status">Waiting for a reply...</p>}
      {chat.error && (
        <p role="alert">The request failed. Check your server and try again.</p>
      )}
      <ol aria-label="Conversation">
        {chat.messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role}: </strong>
            {message.role === 'user' ||
            message.role === 'assistant' ||
            message.role === 'error'
              ? typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content)
              : 'Activity received'}
          </li>
        ))}
      </ol>
    </main>
  );
}
