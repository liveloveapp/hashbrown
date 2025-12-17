import { text } from './stream/text.fn';

/**
 * Hashbrown adapter for Anthropic.
 * @public
 */
export const HashbrownAnthropic = {
  stream: {
    text,
  },
};
