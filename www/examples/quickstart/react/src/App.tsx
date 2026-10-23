import { Fragment } from 'react';
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiChat } from '@hashbrownai/react';
import { WelcomeCard } from './WelcomeCard';

const components = [
  exposeComponent(WelcomeCard, {
    name: 'WelcomeCard',
    description: 'Welcome a developer with a title and a short message.',
    props: {
      title: s.string('A short welcome title'),
      message: s.string('A one-sentence welcome message'),
    },
    children: false,
  }),
];

/** Generates a welcome card from the components we expose. */
export function App() {
  const chat = useUiChat({
    system: 'Welcome developers to Hashbrown. Render one WelcomeCard.',
    components,
  });

  return (
    <main>
      <h1>Your first generated UI</h1>
      <button
        type="button"
        disabled={chat.isLoading}
        onClick={() =>
          chat.sendMessage({
            role: 'user',
            content:
              'Welcome a developer to Hashbrown. Render a WelcomeCard with a short title and a one-sentence message.',
          })
        }
      >
        Generate a welcome card
      </button>
      {chat.isLoading && <p role="status">Creating your card...</p>}
      {chat.error && (
        <p role="alert">
          We could not create the card. Check your server, then try again.
        </p>
      )}
      {chat.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Fragment key={index}>{message.ui}</Fragment>
        ) : null,
      )}
    </main>
  );
}
