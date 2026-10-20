import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { OpenAITextStreamOptions } from './stream/types';

export type { OpenAIReasoningOption } from './stream/reasoning';
export type {
  OpenAIHashbrownRunAgentInput,
  OpenAITextStreamOptions,
} from './stream/types';

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
