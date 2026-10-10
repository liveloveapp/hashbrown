import { isTyping, SOURCE_URLS } from '@atc/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';

/**
 * The message pill and the core-file footnote. `/` focuses the pill from
 * anywhere outside another field.
 */
export function Composer({
  busy = false,
  onSend,
}: {
  busy?: boolean;
  onSend: (content: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      const modified = event.ctrlKey || event.metaKey || event.altKey;
      if (
        event.key !== '/' ||
        modified ||
        event.defaultPrevented ||
        isTyping(event.target)
      ) {
        return;
      }
      event.preventDefault();
      field.current?.focus();
    };
    document.addEventListener('keydown', focusOnSlash);

    return () => document.removeEventListener('keydown', focusOnSlash);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (content) {
      onSend(content);
      setDraft('');
    }
    field.current?.focus();
  };

  return (
    <div className="atc-composer">
      <form className="atc-composer-pill" onSubmit={submit}>
        <input
          ref={field}
          aria-label="Message"
          placeholder="Ask about the planes"
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <kbd className="atc-kbd" aria-hidden="true">
          /
        </kbd>
        <button
          type="submit"
          className="atc-send"
          aria-label="Send"
          disabled={busy}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
      <a
        className="atc-footnote"
        href={SOURCE_URLS.react}
        target="_blank"
        rel="noreferrer"
      >
        View the core file
      </a>
    </div>
  );
}
