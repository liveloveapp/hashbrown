import { isFocusShortcut, type RouterShown } from '@atc/shared';
import type { Decision } from '@hashbrownai/core';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { usePublishDev } from './dev-mode';
import { useRouter } from './router';

/**
 * The one input, a pill floating over the bottom of the transcript. As you
 * type, a badge shows where Enter will send the text (`→ filter 0.97`): the
 * map filter (`onFilter`), clearing it (`onClear`), or the chat (`onChat`).
 * `onChat` and `onFilter` also get what the router decided, and the router's
 * live decision goes to the developer drawer. `/` focuses the pill from anywhere outside another field. `transport`
 * replaces the router's HTTP transport (tests).
 */
export function Composer({
  busy = false,
  onChat,
  onFilter,
  onClear,
  transport,
}: {
  busy?: boolean;
  onChat: (content: string, routed: RouterShown) => void;
  onFilter: (content: string, routed: RouterShown) => void;
  onClear: () => void;
  transport?: Decision.Transport;
}) {
  const field = useRef<HTMLInputElement>(null);
  const badgeId = useId();
  const [draft, setDraft] = useState('');
  const router = useRouter(draft, { transport });
  usePublishDev('typing', router.typing);

  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      if (!isFocusShortcut(event)) {
        return;
      }
      event.preventDefault();
      field.current?.focus();
    };
    document.addEventListener('keydown', focusOnSlash);

    return () => document.removeEventListener('keydown', focusOnSlash);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    // Focus first: a tap on Send moved focus to the button, and taking it
    // back opens a phone's sheet, so sending must come after to lower it.
    field.current?.focus();
    if (!content) {
      return;
    }
    const action = await router.submit();
    if (action === null) {
      return;
    }
    // Read before clearing the draft, which resets the router's state.
    const routed = router.shown();
    setDraft('');
    if (action.kind === 'filter') {
      onFilter(content, routed);
    } else if (action.kind === 'clear') {
      onClear();
    } else {
      onChat(content, routed);
    }
  };

  return (
    <div className="atc-composer">
      <form className="atc-composer-pill" onSubmit={submit}>
        <input
          ref={field}
          aria-label="Message"
          placeholder="Ask about the planes"
          autoComplete="off"
          aria-describedby={badgeId}
          value={draft}
          onChange={(event) => {
            router.cancel();
            setDraft(event.target.value);
          }}
        />
        <span id={badgeId} className="atc-route" data-tone={router.badge.tone}>
          {router.badge.label}
        </span>
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
    </div>
  );
}
