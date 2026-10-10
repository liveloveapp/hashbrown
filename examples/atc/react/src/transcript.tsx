import {
  chatStatus,
  labelForHex,
  thinkingStatus,
  type TranscriptItem,
} from '@atc/shared';
import type { Chat } from '@hashbrownai/core';
import type { UiChatMessage } from '@hashbrownai/react';
import { useAtcState } from './store';
import { ToolChips } from './tool-chips';

/**
 * The conversation: user bubbles, tool activity lines and rendered answers,
 * plus a shimmering "Thinking…" line while the assistant works with nothing
 * else on screen saying so. The list is a polite live region that is busy
 * while the answer streams, so screen readers announce each new row once
 * instead of every token. Since nothing inside a busy region is announced,
 * a visually hidden status region beside it says what the assistant is doing
 * now (the running step, else "Thinking…"); it stays mounted, so each change
 * is announced.
 */
export function Transcript({
  items,
  busy = false,
}: {
  items: readonly TranscriptItem<UiChatMessage<Chat.AnyTool>>[];
  busy?: boolean;
}) {
  const thinking = thinkingStatus(items, busy);
  const status = chatStatus(items, busy, labelForHex(useAtcState()));

  return (
    <>
      <ol
        className="atc-transcript"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={busy}
      >
        {items.map((item, index) =>
          item.kind === 'user' ? (
            <li key={index} className="atc-user">
              {item.text}
            </li>
          ) : item.kind === 'tools' ? (
            <li key={index}>
              <ToolChips calls={item.calls} busy={busy} />
            </li>
          ) : (
            <li key={index} className="atc-answer">
              {item.message.ui}
            </li>
          ),
        )}
        {thinking === null ? null : (
          <li className="atc-activity" data-testid="thinking">
            <span className="atc-activity-text atc-shimmer">{thinking}</span>
          </li>
        )}
      </ol>
      <p
        className="atc-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="chat-status"
      >
        {status}
      </p>
    </>
  );
}
