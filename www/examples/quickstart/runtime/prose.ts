import { type FinishReason } from '@hashbrownai/core';

/** Instructions for a bounded Markdown reply with an explicitly supplied source. */
export const proseSystem =
  'Write a short packing reply in Markdown with a level-two heading, bold emphasis, and a two-item list. End with See setup details[^docs]. Use only this source definition: [^docs]: Hashbrown docs https://hashbrown.dev. A citation is a source reference, not proof that the reply is correct.';

/** Returns the latest assistant string without falling back to an earlier reply. */
export function latestAssistantText(
  messages: readonly { role: string; content?: unknown }[],
): string {
  const message = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  return typeof message?.content === 'string' ? message.content : '';
}

/** Separates parser finalization from the outcome of an explicitly started run. */
export function proseState(input: {
  started: boolean;
  stopped: boolean;
  error: unknown;
  finishReason?: FinishReason;
  isLoading: boolean;
  isSending: boolean;
  isReceiving: boolean;
  isGenerating: boolean;
}): { busy: boolean; isComplete: boolean; status: string } {
  const busy =
    input.isLoading ||
    input.isSending ||
    input.isReceiving ||
    input.isGenerating;
  const status = busy
    ? 'Generating reply…'
    : input.error
      ? 'Request failed. Generate another reply to try again.'
      : input.stopped
        ? 'Stopped. Generate another reply to start again.'
        : input.finishReason && input.finishReason !== 'stop'
          ? 'Reply ended early. Generate another reply.'
          : input.started
            ? 'Reply complete.'
            : 'Ready';

  return { busy, isComplete: !busy, status };
}
