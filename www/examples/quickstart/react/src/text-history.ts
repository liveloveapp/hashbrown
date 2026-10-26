import type { Chat } from '@hashbrownai/core';

/** One visible message in this example's deliberately text-only storage format. */
export interface SavedTextMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** A load result that distinguishes unavailable storage from incompatible saved data. */
export interface LoadedTextHistory {
  readonly messages: SavedTextMessage[];
  readonly issue: 'invalid' | 'unavailable' | null;
}

/** The runtime fields inspected before saving a completed text conversation. */
export interface TextHistorySource {
  readonly role: string;
  readonly content?: unknown;
  readonly toolCalls?: readonly unknown[];
  readonly serverToolCalls?: readonly unknown[];
}

function validTextMessages(value: unknown): value is SavedTextMessage[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.length <= 10000 &&
        Object.keys(message).every(
          (key) => key === 'role' || key === 'content',
        ),
    ) &&
    (value.length === 0 || value[value.length - 1].role === 'assistant')
  );
}

/** Namespaces a conversation's storage without treating its identity as authorization. */
export function textHistoryKey(threadId: string): string {
  return `hashbrown:text-history:${encodeURIComponent(threadId)}`;
}

/** Reads version 1 text history, rejecting malformed or unknown versions. */
export function decodeTextHistory(stored: string | null): LoadedTextHistory {
  if (stored === null) return { issue: null, messages: [] };
  try {
    const value: unknown = JSON.parse(stored);
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'messages' in value &&
      validTextMessages(value.messages)
    ) {
      return {
        issue: null,
        messages: value.messages.map(({ role, content }) => ({
          role,
          content,
        })),
      };
    }
  } catch {
    /* Invalid storage is reported rather than passed into the runtime. */
  }
  return { issue: 'invalid', messages: [] };
}

/** Projects a completed text conversation; tool/checkpoint data is not a supported format. */
export function encodeTextHistory(
  messages: readonly TextHistorySource[],
): string {
  const text = messages.map(({ role, content }) => ({ role, content }));
  if (
    !validTextMessages(text) ||
    messages.some(
      (message) =>
        (message.toolCalls?.length ?? 0) > 0 ||
        (message.serverToolCalls?.length ?? 0) > 0,
    )
  )
    throw new Error('Only completed text conversations can be saved');
  return JSON.stringify({ version: 1, messages: text });
}

/** Loads one conversation, including a browser storage getter that may throw. */
export function loadTextHistory(
  threadId: string,
  storage?: Pick<Storage, 'getItem'>,
): LoadedTextHistory {
  try {
    return decodeTextHistory(
      (storage ?? globalThis.localStorage).getItem(textHistoryKey(threadId)),
    );
  } catch {
    return { issue: 'unavailable', messages: [] };
  }
}

/** Saves supported completed text only; failures leave the previous stored value intact. */
export function saveTextHistory(
  threadId: string,
  messages: readonly TextHistorySource[],
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const encoded = encodeTextHistory(messages);
    (storage ?? globalThis.localStorage).setItem(
      textHistoryKey(threadId),
      encoded,
    );
    return true;
  } catch {
    return false;
  }
}

/** Deletes only the selected conversation and reports storage failures. */
export function deleteTextHistory(
  threadId: string,
  storage?: Pick<Storage, 'removeItem'>,
): boolean {
  try {
    (storage ?? globalThis.localStorage).removeItem(textHistoryKey(threadId));
    return true;
  } catch {
    return false;
  }
}

/** Recreates public text-chat inputs, without restoring a canonical agent checkpoint. */
export function restoreTextMessages(
  messages: readonly SavedTextMessage[],
): Chat.MessageInput<string, Chat.AnyTool>[] {
  return messages.map((message) =>
    message.role === 'assistant'
      ? { role: 'assistant', content: message.content, toolCalls: [] }
      : { role: 'user', content: message.content },
  );
}
