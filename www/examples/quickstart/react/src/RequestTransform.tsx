import { useState } from 'react';
import { createHttpTransport } from '@hashbrownai/core';
import { useChat } from '@hashbrownai/react';

const transport = createHttpTransport({ baseUrl: '/api/transformed-chat' });

/** Runs a fresh support request through the server-owned provider request transformation. */
export function RequestTransform() {
  const [prompt, setPrompt] = useState(
    'How quickly will our team get support?',
  );
  const [started, setStarted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const chat = useChat({
    system: '',
    transport,
    debugName: 'request-transform',
  });
  const busy =
    chat.isSending || chat.isReceiving || chat.isGenerating || chat.isLoading;
  const message = [...chat.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const reply =
    !stopped && !chat.error && typeof message?.content === 'string'
      ? message.content
      : '';
  const status = stopped
    ? 'Stopped. Ask the assistant to start again.'
    : busy
      ? 'Sending support question…'
      : chat.error
        ? 'Request failed. Ask the assistant to try again.'
        : !started
          ? 'Ready'
          : chat.lastRunFinishReason && chat.lastRunFinishReason !== 'stop'
            ? 'Reply ended early. Ask the assistant to try again.'
            : 'Support reply complete.';

  function run() {
    if (busy || !prompt.trim()) return;
    setStarted(true);
    setStopped(false);
    chat.setMessages([
      { id: crypto.randomUUID(), role: 'user', content: prompt.trim() },
    ]);
  }

  function cancel() {
    if (!busy) return;
    setStopped(true);
    chat.stop();
  }

  return (
    <main>
      <h1>Add workspace context on the server</h1>
      <label htmlFor="support-question">Support question</label>
      <textarea
        id="support-question"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <nav aria-label="Support actions">
        <button type="button" disabled={busy || !prompt.trim()} onClick={run}>
          Ask the assistant
        </button>
        <button type="button" disabled={!busy} onClick={cancel}>
          Cancel
        </button>
      </nav>
      <p role="status">{status}</p>
      {chat.error && !stopped && !busy && (
        <p role="alert">
          Check your server, then select Ask the assistant to try again.
        </p>
      )}
      <h2>Support reply</h2>
      <section aria-label="Support reply" aria-busy={busy}>
        <p>{reply}</p>
      </section>
    </main>
  );
}
