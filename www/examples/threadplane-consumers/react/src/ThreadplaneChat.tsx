import { useChat } from '@hashbrownai/react';
import { ChatInput, TextTranscript } from '@threadplane/react/chat';

/** Presents a Hashbrown text conversation with Threadplane controls. */
export function ThreadplaneChat() {
  const chat = useChat({
    system:
      'Help with general product questions. Ask when a detail is missing.',
    debugName: 'threadplane-chat',
  });
  const busy =
    chat.isSending || chat.isReceiving || chat.isGenerating || chat.isLoading;
  const rows = chat.messages.flatMap((message) =>
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
      ? [{ id: message.id, role: message.role, content: message.content }]
      : [],
  );

  return (
    <main className="tp-chat">
      <h1>Ask a product question</h1>
      <TextTranscript messages={rows} label="Conversation" />
      {chat.error && (
        <p role="alert">
          The request failed. Check your connection and try again.
        </p>
      )}
      <ChatInput
        label="Your message"
        defaultValue="Where can I find shipping information?"
        busy={busy}
        onSubmit={(text) => {
          if (busy || !text.trim()) return false;
          chat.sendMessage({ role: 'user', content: text.trim() });
          return true;
        }}
        onStop={() => {
          if (busy) chat.stop();
        }}
      />
      <p role="status">{busy ? 'Receiving a reply…' : 'Ready'}</p>
    </main>
  );
}
