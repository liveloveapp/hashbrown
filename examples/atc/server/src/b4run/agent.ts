import { agent, type OpenAIReasoningConfig } from '@b4run/sdk';
import { SYSTEM_PROMPT } from '@atc/shared';
import type { RunHandlerOptions } from '../run-handler';
import { MAX_OUTPUT_TOKENS } from '../run-policy';

/** Defines the optional agent while keeping every model rule owned by ATC. */
export function createAtcAgent(
  options: Pick<RunHandlerOptions, 'model' | 'reasoningEffort'>,
) {
  const effort =
    options.reasoningEffort === undefined ? 'low' : options.reasoningEffort;
  const reasoningModel =
    /^(o\d|gpt-(?:[5-9]|\d{2,})(?!\d))/i.test(options.model) &&
    !/-chat(?:-|$)/i.test(options.model);
  if (reasoningModel && effort === 'max') {
    throw new Error(
      'OPENAI_REASONING_EFFORT=max is not supported by the b4.run backend',
    );
  }
  const reasoning: OpenAIReasoningConfig | undefined =
    reasoningModel && effort !== null
      ? { effort: effort as OpenAIReasoningConfig['effort'], summary: 'auto' }
      : undefined;
  const config = {
    model: options.model,
    provider: 'openai' as const,
    systemPrompt: SYSTEM_PROMPT,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    recursionLimit: 32,
    delegation: { default: 'deny' as const },
    tools: { allow: [] },
    ...(reasoning ? { reasoning: { openai: reasoning } } : {}),
  };
  const descriptor = agent(config);
  // Current releases predate this compatibility work. Fail before accepting
  // requests if a release would silently drop the server's output cap.
  if (
    !('maxOutputTokens' in descriptor) ||
    descriptor.maxOutputTokens !== MAX_OUTPUT_TOKENS
  ) {
    throw new Error(
      'The b4.run backend requires the browser-tool compatibility fixes and maxOutputTokens support; install a compatible b4.run package set',
    );
  }
  return descriptor;
}
