import type { ToolCallLike, TranscriptItem } from '@atc/shared';
import type { ReactNode } from 'react';
import { ToolChips } from './tool-chips';

/** The parts of a chat message the transcript renders. */
export type TranscriptMessage =
  | {
      readonly role: 'assistant';
      readonly content?: unknown;
      readonly toolCalls?: readonly ToolCallLike[];
      readonly ui: ReactNode;
    }
  | { readonly role: 'user' | 'error'; readonly content?: unknown };

/**
 * The conversation: user bubbles, folded tool chip rows and rendered answers.
 * It is a polite live region that is busy while the answer streams, so screen
 * readers announce each new row once instead of every token.
 */
export function Transcript({
  items,
  busy = false,
}: {
  items: readonly TranscriptItem<TranscriptMessage>[];
  busy?: boolean;
}) {
  return (
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
          <li key={index}>{item.message.ui}</li>
        ),
      )}
    </ol>
  );
}
