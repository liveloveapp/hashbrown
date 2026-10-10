import { messageText, type ToolCallLike } from './views';

/** The parts of a Hashbrown chat message that the transcript reads. */
export interface TranscriptMessageLike {
  readonly role: string;
  readonly content?: unknown;
  readonly toolCalls?: readonly ToolCallLike[];
}

/** One row of the chat transcript. */
export type TranscriptItem<M extends TranscriptMessageLike> =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'tools'; readonly calls: readonly ToolCallLike[] }
  | {
      readonly kind: 'answer';
      readonly message: Extract<M, { readonly role: 'assistant' }>;
    };

function hasAnswer(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  const ui = (content as { ui?: unknown }).ui;

  return Array.isArray(ui) && ui.length > 0;
}

/**
 * Turns chat messages into transcript rows. Hashbrown sends each tool call as
 * its own assistant message; consecutive calls fold into one chip row until an
 * answer or a user message ends it. Error messages are left to the error card.
 */
export function transcriptItems<M extends TranscriptMessageLike>(
  messages: readonly M[],
): TranscriptItem<M>[] {
  return messages.reduce<TranscriptItem<M>[]>((items, message) => {
    if (message.role === 'user') {
      return [...items, { kind: 'user', text: messageText(message.content) }];
    }
    if (message.role !== 'assistant') return items;
    const calls = message.toolCalls ?? [];
    const last = items.at(-1);
    const withCalls: TranscriptItem<M>[] =
      calls.length === 0
        ? items
        : last?.kind === 'tools'
          ? [
              ...items.slice(0, -1),
              { kind: 'tools', calls: [...last.calls, ...calls] },
            ]
          : [...items, { kind: 'tools', calls }];

    return hasAnswer(message.content)
      ? [
          ...withCalls,
          {
            kind: 'answer',
            message: message as Extract<M, { readonly role: 'assistant' }>,
          },
        ]
      : withCalls;
  }, []);
}
