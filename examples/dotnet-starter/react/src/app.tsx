import { useState } from 'react';
import { useChat, useTool } from '@hashbrownai/react';
import {
  createBrowserReader,
  decisions,
  newConversation,
  noteSchema,
  type OutcomeChoice,
  readRecovery,
  rememberThread,
  selectedThread,
  settlement,
  system,
} from '../../shared/conversation';

/** Real public React client; all recovered work remains inert until explicit settlement. */
export function App() {
  const [threadId] = useState(selectedThread);
  const [prompt, setPrompt] = useState('Look up SFO and read my browser note.');
  const [note, setNote] = useState('A local browser note.');
  const [browserPending, setBrowserPending] = useState(false);
  const [reader] = useState(() => createBrowserReader(setBrowserPending));
  const [choices, setChoices] = useState<
    Readonly<Record<string, OutcomeChoice>>
  >({});
  const [status, setStatus] = useState('Ready.');
  const [reading, setReading] = useState(false);
  const tool = useTool({
    name: 'readBrowserNote',
    description: 'Read the local browser note after the user releases it.',
    schema: noteSchema,
    handler: reader.read,
    deps: [reader],
  });
  const chat = useChat({
    system,
    tools: [tool],
    threadId,
    debounceTime: 0,
    retries: 0,
  });
  const active = chat.isLoading || chat.isResuming;
  const pending = chat.pendingConversationRecovery;
  const interrupts = chat.pendingInterrupts;
  const busy = active || reading;
  const act = (action: () => void) => {
    try {
      rememberThread(threadId);
      action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Action refused.');
    }
  };
  const recover = async () => {
    const revision = chat.recovery.revision;
    setReading(true);
    try {
      rememberThread(threadId);
      const envelope = await readRecovery(
        threadId,
        chat.getRecoveryConfiguration(),
      );
      setStatus(
        envelope.reason
          ? `${envelope.disposition}: ${envelope.reason}`
          : envelope.disposition,
      );
      if (
        envelope.snapshot &&
        ['Pending', 'Completed'].includes(envelope.disposition)
      ) {
        chat.restoreConversation(envelope.snapshot, {
          expectedRevision: revision,
        });
        setChoices(
          Object.fromEntries(
            (envelope.snapshot.pendingBrowserRecovery?.callIds ?? []).map(
              (id) => [id, { status: 'unavailable', json: '' }],
            ),
          ),
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Recovery refused.');
    } finally {
      setReading(false);
    }
  };
  const choose = (id: string, change: Partial<OutcomeChoice>) =>
    setChoices((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? { status: 'unavailable', json: '' }),
        ...change,
      },
    }));
  return (
    <main>
      <h1>Hashbrown .NET starter · React</h1>
      <p>
        Development identity only. Native approval is a workflow decision;
        application permissions remain server-owned.
      </p>
      <small data-testid="thread">Thread: {threadId}</small>
      <button type="button" onClick={newConversation} disabled={busy}>
        New conversation
      </button>
      <section>
        <label>
          Message
          <input
            data-testid="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
        </label>
        <button
          data-testid="send"
          type="button"
          disabled={
            busy ||
            !!pending ||
            !!chat.pendingInterrupts ||
            chat.recovery.required
          }
          onClick={() =>
            act(() => chat.sendMessage({ role: 'user', content: prompt }))
          }
        >
          Send
        </button>
        <button
          data-testid="stop"
          type="button"
          disabled={!active}
          onClick={() => act(chat.stop)}
        >
          Interrupt running work
        </button>
        <button
          data-testid="recover"
          type="button"
          disabled={busy || !!pending || !!chat.pendingInterrupts}
          onClick={() => void recover()}
        >
          Recover this conversation
        </button>
      </section>
      <section>
        <h2>Browser tool</h2>
        <label>
          Local note
          <input
            data-testid="note"
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
        <button
          data-testid="browser-release"
          type="button"
          disabled={!browserPending}
          onClick={() => reader.release(note)}
        >
          Release browser result
        </button>
        <small data-testid="browser-pending">
          {browserPending ? 'Browser read waiting' : 'No browser read waiting'}
        </small>
      </section>
      {interrupts && !pending && (
        <section>
          <h2>Native approval</h2>
          {interrupts.interrupts.map((item) => (
            <p key={item.id}>{item.message ?? item.reason}</p>
          ))}
          {(['approve', 'decline', 'cancel'] as const).map((decision) => (
            <button
              key={decision}
              data-testid={`approval-${decision}`}
              disabled={busy}
              type="button"
              onClick={() =>
                act(() =>
                  chat.resume({
                    batchId: interrupts.id,
                    entries: decisions(interrupts.interrupts, decision),
                  }),
                )
              }
            >
              {decision}
            </button>
          ))}
        </section>
      )}
      {pending && (
        <section>
          <h2>Recovered browser work</h2>
          <p>
            Supply an already known result or acknowledge that it is
            unavailable. Recovery never reruns the original browser handler.
          </p>
          {pending.toolCalls.map((call) => (
            <fieldset key={call.id}>
              <legend>
                {call.name} · {call.id}
              </legend>
              <pre>{JSON.stringify(call.arguments)}</pre>
              <label>
                Outcome
                <select
                  data-testid="recovery-outcome"
                  value={choices[call.id]?.status ?? 'unavailable'}
                  onChange={(event) =>
                    choose(call.id, {
                      status:
                        event.currentTarget.value === 'result'
                          ? 'result'
                          : 'unavailable',
                    })
                  }
                >
                  <option value="unavailable">
                    Result unavailable; do not replay
                  </option>
                  <option value="result">Already known result</option>
                </select>
              </label>
              <label>
                Known JSON result
                <textarea
                  data-testid="recovery-json"
                  value={choices[call.id]?.json ?? ''}
                  onChange={(event) =>
                    choose(call.id, { json: event.currentTarget.value })
                  }
                />
              </label>
            </fieldset>
          ))}
          <p>
            Apply the following decision to every genuine protected approval in
            this complete batch.
          </p>
          {(['approve', 'decline', 'cancel'] as const).map((decision) => (
            <button
              key={decision}
              data-testid={`settle-${decision}`}
              disabled={busy}
              type="button"
              onClick={() =>
                act(() =>
                  chat.resumeConversationRecovery(
                    settlement(pending, choices, decision),
                  ),
                )
              }
            >
              Settle all · {decision}
            </button>
          ))}
        </section>
      )}
      <p data-testid="status" role="status">
        {status}
      </p>
      {chat.error && (
        <p className="error" data-testid="error">
          {chat.error.message}
        </p>
      )}
      <section>
        <h2>Conversation</h2>
        <pre data-testid="messages">
          {JSON.stringify(chat.messages, null, 2)}
        </pre>
      </section>
      <section>
        <h2>Recovery diagnostics</h2>
        <pre data-testid="diagnostics">
          {JSON.stringify(chat.recovery.diagnostics ?? [], null, 2)}
        </pre>
      </section>
    </main>
  );
}
