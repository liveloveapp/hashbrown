import { text } from './stream/text.fn';

/**
 * Hashbrown adapter for OpenAI.
 * @public
 */
export const HashbrownOpenAI = {
  stream: {
    text,
  },
};
