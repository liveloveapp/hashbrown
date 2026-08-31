import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { GoogleTextStreamOptions } from './stream/types';

export type {
  GoogleApiKeyAuthOptions,
  GoogleHashbrownRunAgentInput,
  GoogleTextStreamOptions,
  GoogleVertexAIAuthOptions,
} from './stream/types';

/**
 * Hashbrown adapter for Google models.
 * @public
 */
export const HashbrownGoogle: {
  readonly stream: {
    readonly text: (
      options: GoogleTextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
