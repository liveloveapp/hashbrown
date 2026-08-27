import type { AGUIEvent } from '@ag-ui/core';
import { type OpenAITextStreamOptions, text } from './stream/text.fn';

export type {
  OpenAIHashbrownRunAgentInput,
  OpenAITextStreamOptions,
} from './stream/text.fn';

/**
 * Hashbrown adapter for OpenAI.
 * @public
 */
export const HashbrownOpenAI: {
  readonly stream: {
    readonly text: (
      options: OpenAITextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
