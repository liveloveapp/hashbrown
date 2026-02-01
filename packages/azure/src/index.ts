import { text } from './stream/text.fn';

/**
 * Hashbrown adapter for Azure OpenAI.
 * @public
 */
export const HashbrownAzure = {
  stream: {
    text,
  },
};
