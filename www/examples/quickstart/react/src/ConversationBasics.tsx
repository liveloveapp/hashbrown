import { useState } from 'react';
import { useChat } from '@hashbrownai/react';

/** A text conversation that keeps earlier turns in the current chat instance. */
export function ConversationBasics() {
  const [prompt, setPrompt] = useState(
    'Call my two-step demo plan Lighthouse. What should I do first?',
  );
  const chat = useChat({
    system:
      'Help discuss a small two-step plan. Remember the plan name in this conversation. Keep replies concise.',
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
          setPrompt('What did I name my plan, and what comes next?');
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
