import { useState } from 'react';
import {
  type MagicTextCitationRenderData,
  MagicTextRenderer,
  useChat,
} from '@hashbrownai/react';
import {
  latestAssistantText,
  magicTextState,
  magicTextSystem,
} from '../../runtime/magic-text';

/** Streams a fresh Markdown reply and opens source details without navigation. */
export function MagicTextDemo() {
  const [started, setStarted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [citation, setCitation] = useState<MagicTextCitationRenderData | null>(
    null,
  );
  const chat = useChat({ system: magicTextSystem, debugName: 'magic-text' });
  const state = magicTextState({
    started,
    stopped,
    error: chat.error,
    finishReason: chat.lastRunFinishReason,
    isLoading: chat.isLoading,
    isSending: chat.isSending,
    isReceiving: chat.isReceiving,
    isGenerating: chat.isGenerating,
  });
  const text = latestAssistantText(chat.messages);

  return (
    <main>
      <h1>Magic Text</h1>
      <p>
        Generate a packing reply, then select its citation to inspect the
        source.
      </p>
      <nav aria-label="Reply actions">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => {
            setStarted(true);
            setStopped(false);
            setCitation(null);
            chat.setMessages([
              {
                id: crypto.randomUUID(),
                role: 'user',
                content:
                  'Write a small packing list with a passport and charger, and cite the supplied setup documentation.',
              },
            ]);
          }}
        >
          Generate reply
        </button>
        <button
          type="button"
          disabled={!state.busy}
          onClick={() => {
            setStopped(true);
            chat.stop();
          }}
        >
          Cancel
        </button>
      </nav>
      <p role="status">{state.status}</p>
      {chat.error && (
        <p role="alert">Check your server, then generate another reply.</p>
      )}
      <section aria-label="Generated reply" aria-busy={state.busy}>
        <MagicTextRenderer
          isComplete={state.isComplete}
          caret={state.busy}
          onCitationClick={(event, selected) => {
            event.preventDefault();
            setCitation(selected);
          }}
        >
          {text}
        </MagicTextRenderer>
      </section>
      <p>
        Source markers without a source URL are unresolved and cannot open
        details yet.
      </p>
      {citation && (
        <aside aria-label="Source details">
          <h2>Source {citation.number}</h2>
          <p>
            {citation.id === 'docs'
              ? 'Hashbrown docs'
              : `Reference ${citation.id}`}
          </p>
          <p>{citation.url ?? 'Source URL unavailable.'}</p>
          <p>
            This citation is a model-provided reference. It does not verify the
            reply.
          </p>
          <button type="button" onClick={() => setCitation(null)}>
            Close source details
          </button>
        </aside>
      )}
      <p>
        When the stream ends, isComplete finalizes Markdown parsing, including
        after cancellation or an error.
      </p>
    </main>
  );
}
