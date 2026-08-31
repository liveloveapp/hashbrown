import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { BedrockTextStreamOptions } from './stream/types';

export type {
  BedrockHashbrownRunAgentInput,
  BedrockTextStreamOptions,
} from './stream/types';

/**
 * Hashbrown adapter for AWS Bedrock.
 * @public
 */
export const HashbrownBedrock: {
  readonly stream: {
    readonly text: (
      options: BedrockTextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
