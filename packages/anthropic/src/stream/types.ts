import type { RunAgentInput } from '@ag-ui/core';

/**
 * Hashbrown extensions accepted alongside a standard AG-UI run input.
 *
 * @public
 */
export interface AnthropicHashbrownRunAgentInput extends RunAgentInput {
  hashbrown?: {
    responseSchema?: object;
    ui?: boolean;
  };
}
