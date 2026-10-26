import { useEffect, useState } from 'react';
import { useChat } from '@hashbrownai/react';
import {
  deleteTextHistory,
  type LoadedTextHistory,
  loadTextHistory,
  restoreTextMessages,
  saveTextHistory,
} from './text-history';

type ThreadId = 'personal' | 'work';
interface Selection {
  readonly id: ThreadId;
  readonly initial: LoadedTextHistory;
  readonly revision: number;
}

/** Switches between two browser-stored, completed text conversations. */
export function SavedConversations() {
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    setSelection({
      id: 'personal',
      initial: loadTextHistory('personal'),
      revision: 0,
    });
  }, []);

  return (
    <main>
      <h1>A conversation that survives refresh</h1>
      {selection ? (
        <SavedThread
          key={`${selection.id}:${selection.revision}`}
          selection={selection}
          onSelect={(id) =>
            setSelection({ id, initial: loadTextHistory(id), revision: 0 })
          }
          onReset={() =>
            setSelection({
              ...selection,
              initial: loadTextHistory(selection.id),
              revision: selection.revision + 1,
            })
          }
        />
      ) : (
        <p role="status">Loading saved conversation...</p>
      )}
    </main>
  );
}

function SavedThread({
  selection,
  onSelect,
  onReset,
}: {
  selection: Selection;
  onSelect: (id: ThreadId) => void;
  onReset: () => void;
}) {
  const [prompt, setPrompt] = useState(
    'My name is Sam. Say hello in one sentence.',
  );
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>(
    'idle',
  );
  const chat = useChat({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: selection.id,
    messages: restoreTextMessages(selection.initial.messages),
  });

  useEffect(() => {
    if (chat.isLoading || chat.error || chat.messages.length === 0) return;
    if (selection.initial.issue) {
      setSaveState('failed');
      return;
    }
    setSaveState(
      saveTextHistory(selection.id, chat.messages) ? 'saved' : 'failed',
    );
  }, [
    chat.error,
    chat.isLoading,
    chat.messages,
    selection.id,
    selection.initial.issue,
  ]);

  function clear() {
    if (deleteTextHistory(selection.id)) onReset();
    else setSaveState('failed');
  }

  return (
    <>
      <label htmlFor="conversation">Conversation</label>
      <select
        id="conversation"
        value={selection.id}
        disabled={chat.isLoading}
        onChange={(event) => {
          const id = event.currentTarget.value;
          if (id === 'personal' || id === 'work') onSelect(id);
        }}
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
      </select>
      {selection.initial.issue && (
        <p role="alert">
          Saved messages could not be restored. Clear this conversation to
          replace them.
        </p>
      )}
      <label htmlFor="prompt">Your message</label>
      <input
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={
          chat.isLoading ||
          !prompt.trim() ||
          selection.initial.issue === 'invalid'
        }
        onClick={() => {
          chat.sendMessage({ role: 'user', content: prompt });
          setPrompt('');
        }}
      >
        Send message
      </button>
      <button type="button" disabled={chat.isLoading} onClick={clear}>
        Clear this conversation
      </button>
      {chat.isLoading && <p role="status">Waiting for a reply...</p>}
      {chat.error && (
        <p role="alert">
          The request failed. The previous saved conversation is unchanged.
        </p>
      )}
      {saveState === 'saved' && !chat.isLoading && (
        <p role="status">Saved in this browser</p>
      )}
      {saveState === 'failed' && (
        <p role="alert">
          We could not save or clear this conversation. Keep this page open to
          retain its current messages.
        </p>
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
    </>
  );
}
