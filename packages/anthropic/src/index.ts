import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { AnthropicTextStreamOptions } from './stream/types';

export type {
  AnthropicHashbrownRunAgentInput,
  AnthropicTextStreamOptions,
} from './stream/types';

/**
 * Hashbrown adapter for Anthropic.
 * @public
 */
export const HashbrownAnthropic: {
  readonly stream: {
    readonly text: (
      options: AnthropicTextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
