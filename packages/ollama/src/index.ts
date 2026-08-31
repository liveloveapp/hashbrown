import type { AGUIEvent } from '@ag-ui/core';
import { text } from './stream/text.fn';
import type { OllamaTextStreamOptions } from './stream/types';

export type {
  OllamaHashbrownRunAgentInput,
  OllamaTextStreamOptions,
} from './stream/types';

/**
 * Hashbrown adapter for Ollama models.
 *
 * @public
 */
export const HashbrownOllama: {
  readonly stream: {
    readonly text: (
      options: OllamaTextStreamOptions,
    ) => AsyncIterable<AGUIEvent>;
  };
} = {
  stream: {
    text,
  },
};
