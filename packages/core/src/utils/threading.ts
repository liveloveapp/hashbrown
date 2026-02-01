import { Chat } from '../models';
import { deepEqual } from './deep-equal';

/**
 * Merge previously persisted thread messages with an incoming delta-only
 * payload by finding the longest overlap and appending only the new tail.
 * This is effectively the inverse of `_extractMessageDelta`.
 * @public
 */
export function mergeMessagesForThread(
  saved: Chat.Api.Message[] = [],
  incoming: Chat.Api.Message[] = [],
): Chat.Api.Message[] {
  if (saved.length === 0) {
    return incoming.map(cloneMessage);
  }

  if (incoming.length === 0) {
    return saved.map(cloneMessage);
  }

  const maxOverlap = Math.min(saved.length, incoming.length);
  let overlap = 0;

  for (let k = maxOverlap; k > 0; k--) {
    const savedStart = saved.length - k;
    let matches = true;

    for (let i = 0; i < k; i++) {
      if (!messagesEqual(saved[savedStart + i], incoming[i])) {
        matches = false;
        break;
      }
    }

    if (matches) {
      overlap = k;
      break;
    }
  }

  const merged = [
    ...saved.map(cloneMessage),
    ...incoming.slice(overlap).map(cloneMessage),
  ];
  return merged;
}

function messagesEqual(a: Chat.Api.Message, b: Chat.Api.Message): boolean {
  return deepEqual(a, b);
}

function cloneMessage<T extends Chat.Api.Message>(message: T): T {
  return JSON.parse(JSON.stringify(message));
}
