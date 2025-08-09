```tsx
import { useCallback, useRef } from 'react';

type ComposerProps = {
  onSendMessage: (text: string) => void;
  placeholder?: string;
};

export function Composer({ onSendMessage, placeholder = 'Show me all lights' }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const send = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value) return;
    onSendMessage(value);
    el.value = '';
  }, [onSendMessage]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) return; // allow newline on Shift+Enter
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  return (
    <div>
      <textarea
        className="chat-composer"
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        ref={textareaRef}
      />
      <button className="send-button" onClick={send}>
        Send
      </button>
    </div>
  );
}
```
