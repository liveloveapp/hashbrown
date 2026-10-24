import { useEffect, useRef, useState } from 'react';
import { useChat } from '@hashbrownai/react';
import { encodeTextHistory, restoreTextMessages } from './text-history';
import {
  loadServerHistory,
  saveServerHistory,
  type ServerHistory,
} from './server-history';

type ThreadId = 'personal' | 'work';
type SaveState = 'saved' | 'saving' | 'failed';

/** Loads server-owned history before mounting a fresh runtime for the selected thread. */
export function ServerConversations() {
  const [id, setId] = useState<ThreadId>('personal');
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<ServerHistory | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = generation.current;
    const controller = new AbortController();
    setSnapshot(null);
    setIssue(null);
    void loadServerHistory(id, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted && generation.current === current)
          setSnapshot(loaded);
      },
      (error: unknown) => {
        if (!controller.signal.aborted && generation.current === current)
          setIssue(error instanceof Error ? error.message : 'Loading failed.');
      },
    );
    return () => controller.abort();
  }, [id, revision]);

  function reload() {
    generation.current += 1;
    setSnapshot(null);
    setRevision((value) => value + 1);
  }

  return (
    <main>
      <h1>A conversation saved on the server</h1>
      <label htmlFor="conversation">Conversation</label>
      <select
        id="conversation"
        value={id}
        disabled={busy}
        onChange={(event) => {
          if (busy) return;
          const selected = event.currentTarget.value;
          if (
            (selected === 'personal' || selected === 'work') &&
            selected !== id
          ) {
            generation.current += 1;
            setSnapshot(null);
            setId(selected);
          }
        }}
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
      </select>
      {issue ? (
        <p role="alert">{issue}</p>
      ) : (
        !snapshot && <p role="status">Loading saved conversation...</p>
      )}
      {snapshot && (
        <ServerThread
          key={`${id}:${revision}`}
          initial={snapshot}
          onBusy={setBusy}
          onReload={reload}
        />
      )}
      {!snapshot && issue && (
        <button type="button" onClick={reload}>
          Reload saved conversation
        </button>
      )}
    </main>
  );
}

/** Owns one loaded runtime and saves completed responses one at a time. */
export function ServerThread({
  initial,
  onBusy,
  onReload,
}: {
  initial: ServerHistory;
  onBusy: (busy: boolean) => void;
  onReload: () => void;
}) {
  const [prompt, setPrompt] = useState(
    'My name is Sam. Say hello in one sentence.',
  );
  const [state, setState] = useState<SaveState>('saved');
  const [issue, setIssue] = useState<string | null>(null);
  const saved = useRef({
    version: initial.version,
    encoded: encodeTextHistory(initial.messages),
  });
  const inFlight = useRef(false);
  const failed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const chat = useChat({
    system:
      'You are a friendly onboarding assistant. Keep each reply to one sentence.',
    threadId: initial.id,
    messages: restoreTextMessages(initial.messages),
  });

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (chat.isLoading) return;
    if (chat.error) {
      onBusy(false);
      return;
    }
    if (inFlight.current || failed.current) return;
    let encoded: string;
    try {
      encoded = encodeTextHistory(chat.messages);
    } catch {
      failed.current = true;
      setState('failed');
      setIssue('Only completed text conversations can be saved.');
      onBusy(false);
      return;
    }
    if (encoded === saved.current.encoded) {
      onBusy(false);
      return;
    }
    inFlight.current = true;
    onBusy(true);
    setState('saving');
    const abort = new AbortController();
    controller.current = abort;
    void saveServerHistory(
      initial.id,
      saved.current.version,
      chat.messages,
      abort.signal,
    )
      .then(
        (result) => {
          if (abort.signal.aborted) return;
          saved.current = { version: result.version, encoded };
          setState('saved');
        },
        (error: unknown) => {
          if (abort.signal.aborted) return;
          failed.current = true;
          setState('failed');
          setIssue(error instanceof Error ? error.message : 'Saving failed.');
        },
      )
      .finally(() => {
        if (!abort.signal.aborted) {
          inFlight.current = false;
          onBusy(false);
        }
      });
  }, [chat.messages, chat.isLoading, chat.error, initial.id, onBusy]);

  const busy = chat.isLoading || state === 'saving';
  return (
    <>
      <label htmlFor="prompt">Your message</label>
      <input
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={busy || state === 'failed' || !prompt.trim()}
        onClick={() => {
          if (inFlight.current || failed.current) return;
          onBusy(true);
          chat.sendMessage({ role: 'user', content: prompt });
          setPrompt('');
        }}
      >
        Send message
      </button>
      <button type="button" disabled={busy} onClick={onReload}>
        Reload saved conversation
      </button>
      {chat.isLoading && <p role="status">Waiting for a reply...</p>}
      {chat.error && (
        <p role="alert">
          The request failed. The saved conversation is unchanged.
        </p>
      )}
      {state === 'saving' && <p role="status">Saving conversation...</p>}
      {state === 'saved' && !chat.isLoading && !chat.error && (
        <p role="status">Saved on the server</p>
      )}
      {state === 'failed' && (
        <p role="alert">
          {issue} Keep this page open to retain unsaved messages. Reload
          replaces them with the saved conversation.
        </p>
      )}
      <ol aria-label="Conversation">
        {chat.messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role}: </strong>
            {'content' in message && typeof message.content === 'string'
              ? message.content
              : 'Activity received'}
          </li>
        ))}
      </ol>
    </>
  );
}
