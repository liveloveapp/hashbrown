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

/**
 * Adds `text` to the last row when it is a reasoning row, or starts one. So a
 * model call's reasoning sits right before its own tool calls and answer, and
 * reasoning with nothing between merges into one row.
 */
function withReasoning<M extends TranscriptMessageLike>(
  items: readonly TranscriptItem<M>[],
  text: string,
): readonly TranscriptItem<M>[] {
  if (text === '') {
    return items;
  }
  const last = items.at(-1);
  if (last?.kind !== 'reasoning') {
    return [...items, { kind: 'reasoning', text, done: false }];
  }

  return [...items.slice(0, -1), { ...last, text: `${last.text}\n\n${text}` }];
}

/** Adds one chat message's rows. */
function withMessage<M extends TranscriptMessageLike>(
  items: readonly TranscriptItem<M>[],
  message: M,
): readonly TranscriptItem<M>[] {
  if (message.role === 'user') {
    return [...items, { kind: 'user', text: messageText(message.content) }];
  }
  if (message.role !== 'assistant') {
    return items;
  }
  const withCalls = withToolCalls(
    withReasoning(items, message.reasoning ?? ''),
    message.toolCalls ?? [],
  );

  return hasAnswer(message.content)
    ? [
        ...withCalls,
        {
          kind: 'answer',
          message: message as Extract<M, { readonly role: 'assistant' }>,
        },
      ]
    : withCalls;
}

/**
 * Turns chat messages into transcript rows. Hashbrown sends each tool call as
 * its own assistant message; consecutive calls fold into one chip row until an
 * answer or a user message ends it. A message's reasoning summary comes before
 * its tool calls and answer; reasoning with no other row between merges into
 * one row, joined by blank lines. A reasoning row is done once a later row
 * exists or the chat is no longer `busy`. Error messages are left to the error card.
 */
export function transcriptItems<M extends TranscriptMessageLike>(
  messages: readonly M[],
  busy = false,
): TranscriptItem<M>[] {
  const items = messages.reduce<readonly TranscriptItem<M>[]>(withMessage, []);

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
 * named by `labelFor`), "Reasoning…" while a reasoning row streams, else
 * {@link thinkingStatus}. Null when the chat is idle or the answer is
 * streaming.
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

  if (step !== null) {
    return step;
  }
  if (busy && last?.kind === 'reasoning' && !last.done) {
    return 'Reasoning…';
  }

  return thinkingStatus(items, busy);
}
