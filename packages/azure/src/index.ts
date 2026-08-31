import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { AzureTextStreamOptions } from './stream/types';

export type {
  AzureHashbrownRunAgentInput,
  AzureTextStreamOptions,
} from './stream/types';

/**
 * Hashbrown adapter for Azure OpenAI.
 * @public
 */
export const HashbrownAzure: {
  readonly stream: {
    readonly text: (
      options: AzureTextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
