import { text } from './stream/text.fn';

/**
 * Hashbrown adapter for AWS Bedrock.
 * @public
 */
export const HashbrownBedrock = {
  stream: {
    text,
  },
};
