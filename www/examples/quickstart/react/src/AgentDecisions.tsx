import { useState } from 'react';
import { createHttpTransport } from '@hashbrownai/core';
import { useChat } from '@hashbrownai/react';

const transport = createHttpTransport({ baseUrl: '/api/agent' });

/** Runs a fresh support request through the server-owned decision workflow. */
export function AgentDecisions() {
  const [prompt, setPrompt] = useState('Where is order HB-1042?');
  const [started, setStarted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const chat = useChat({ system: '', transport, debugName: 'agent-decisions' });
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
    ? 'Stopped. Run agent to start again.'
    : busy
      ? 'Running agent…'
      : chat.error
        ? 'Request failed. Run agent to try again.'
        : !started
          ? 'Ready'
          : chat.lastRunFinishReason && chat.lastRunFinishReason !== 'stop'
            ? 'Reply ended early. Run agent to try again.'
            : 'Agent reply complete.';

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
      <h1>Route a support request</h1>
      <label htmlFor="customer-message">Customer message</label>
      <textarea
        id="customer-message"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <nav aria-label="Agent actions">
        <button type="button" disabled={busy || !prompt.trim()} onClick={run}>
          Run agent
        </button>
        <button type="button" disabled={!busy} onClick={cancel}>
          Cancel
        </button>
      </nav>
      <p role="status">{status}</p>
      {chat.error && !stopped && !busy && (
        <p role="alert">
          Check your server, then select Run agent to try again.
        </p>
      )}
      <h2>Agent reply</h2>
      <section aria-label="Agent reply" aria-busy={busy}>
        <p>{reply}</p>
      </section>
    </main>
  );
}
