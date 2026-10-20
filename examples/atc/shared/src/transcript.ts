import { type HexLabel, type ToolCallLike, toolRunView } from './tool-chips';

/** The parts of a Hashbrown chat message that the transcript reads. */
export interface TranscriptMessageLike {
  readonly role: string;
  readonly content?: unknown;
  readonly toolCalls?: readonly ToolCallLike[];
  /** The model's reasoning summary, when the provider streams one. */
  readonly reasoning?: string;
}

/** One row of the chat transcript. */
export type TranscriptItem<M extends TranscriptMessageLike> =
  | { readonly kind: 'user'; readonly text: string }
  | { readonly kind: 'tools'; readonly calls: readonly ToolCallLike[] }
  | {
      readonly kind: 'reasoning';
      readonly text: string;
      readonly done: boolean;
    }
  | {
      readonly kind: 'answer';
      readonly message: Extract<M, { readonly role: 'assistant' }>;
    };

/** A user message's text, or an empty string for non-text content. */
export function messageText(content: unknown): string {
  return typeof content === 'string' ? content : '';
}

/**
 * True when an assistant message carries at least one UI element, not only
 * tool calls.
 */
function hasAnswer(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) {
    return false;
  }
  const ui = (content as { ui?: unknown }).ui;

  return Array.isArray(ui) && ui.length > 0;
}

/** Appends `calls` to the last tools row, or starts one. */
function withToolCalls<M extends TranscriptMessageLike>(
  items: readonly TranscriptItem<M>[],
  calls: readonly ToolCallLike[],
): readonly TranscriptItem<M>[] {
  if (calls.length === 0) {
    return items;
  }
  const last = items.at(-1);
  if (last?.kind === 'tools') {
    return [
      ...items.slice(0, -1),
      { kind: 'tools', calls: [...last.calls, ...calls] },
    ];
  }

  return [...items, { kind: 'tools', calls }];
}

/** Rows built so far, and where the current turn's reasoning row sits. */
interface TranscriptDraft<M extends TranscriptMessageLike> {
  readonly items: readonly TranscriptItem<M>[];
  readonly reasoningAt: number | null;
}

/**
 * Adds `text` to the current turn's reasoning row, or starts one. A turn's
 * reasoning reads as one row, even when it arrives across several model calls.
 */
function withReasoning<M extends TranscriptMessageLike>(
  draft: TranscriptDraft<M>,
  text: string,
): TranscriptDraft<M> {
  if (text === '') {
    return draft;
  }
  const { items, reasoningAt } = draft;
  const open = reasoningAt === null ? undefined : items[reasoningAt];
  if (reasoningAt === null || open?.kind !== 'reasoning') {
    return {
      items: [...items, { kind: 'reasoning', text, done: false }],
      reasoningAt: items.length,
    };
  }

  return {
    items: items.map((item, index) =>
      index === reasoningAt
        ? { ...open, text: `${open.text}\n\n${text}` }
        : item,
    ),
    reasoningAt,
  };
}

/** Adds one chat message's rows to the draft. */
function withMessage<M extends TranscriptMessageLike>(
  draft: TranscriptDraft<M>,
  message: M,
): TranscriptDraft<M> {
  if (message.role === 'user') {
    return {
      items: [
        ...draft.items,
        { kind: 'user', text: messageText(message.content) },
      ],
      reasoningAt: null,
    };
  }
  if (message.role !== 'assistant') {
    return draft;
  }
  const reasoned = withReasoning(draft, message.reasoning ?? '');
  const items = withToolCalls(reasoned.items, message.toolCalls ?? []);
  if (!hasAnswer(message.content)) {
    return { items, reasoningAt: reasoned.reasoningAt };
  }

  return {
    items: [
      ...items,
      {
        kind: 'answer',
        message: message as Extract<M, { readonly role: 'assistant' }>,
      },
    ],
    reasoningAt: null,
  };
}

/**
 * Turns chat messages into transcript rows. Hashbrown sends each tool call as
 * its own assistant message; consecutive calls fold into one chip row until an
 * answer or a user message ends it. A message's reasoning summary comes before
 * its tool calls and answer, and a turn's reasoning (everything between a user
 * message or answer and the next) merges into one row, joined by blank lines.
 * A reasoning row is done once a later row exists or the chat is no longer
 * `busy`. Error messages are left to the error card.
 */
export function transcriptItems<M extends TranscriptMessageLike>(
  messages: readonly M[],
  busy = false,
): TranscriptItem<M>[] {
  const { items } = messages.reduce<TranscriptDraft<M>>(withMessage, {
    items: [],
    reasoningAt: null,
  });

  return items.map((item, index) =>
    item.kind === 'reasoning'
      ? { ...item, done: !busy || index < items.length - 1 }
      : item,
  );
}

/**
 * The line that says the assistant is working when nothing else does: after
 * the user's message and after a turn's tools finish, until the answer starts
 * streaming. Null while a tool runs (its own line says what it is doing),
 * while reasoning streams (its row shows progress), once the answer streams,
 * and when the chat is idle.
 */
export function thinkingStatus<M extends TranscriptMessageLike>(
  items: readonly TranscriptItem<M>[],
  busy: boolean,
): string | null {
  const last = items.at(-1);
  if (!busy || last === undefined || last.kind === 'answer') {
    return null;
  }
  if (last.kind === 'tools' && last.calls.some((c) => c.status === 'pending')) {
    return null;
  }
  if (last.kind === 'reasoning' && !last.done) {
    return null;
  }

  return 'Thinking…';
}

/**
 * What the assistant is doing now, for one persistent polite status region
 * outside the busy transcript: the running step ("Following UAL1802…", planes
 * named by `labelFor`), else {@link thinkingStatus}. Null when the chat is
 * idle or the answer is streaming.
 */
export function chatStatus<M extends TranscriptMessageLike>(
  items: readonly TranscriptItem<M>[],
  busy: boolean,
  labelFor?: HexLabel,
): string | null {
  const last = items.at(-1);
  const step =
    busy && last?.kind === 'tools'
      ? toolRunView(last.calls, busy, labelFor).current
      : null;

  return step ?? thinkingStatus(items, busy);
}
