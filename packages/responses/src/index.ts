import { text } from './lib/stream/text.fn';

export * from './lib/responses';
export * from './lib/stream/sse';
export * from './lib/stream/mapping';
export * from './lib/stream/types';
export * from './lib/stream/frames';
export type { OpenResponsesTextStreamOptions } from './lib/stream/text.fn';

/**
 * Hashbrown adapter for Open Responses.
 *
 * @public
 */
export const HashbrownOpenResponses = {
  stream: {
    text,
  },
};
