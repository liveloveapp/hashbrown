import { createAtcAgent } from '../../b4run/agent';
import { parseReasoningEffort } from '../../run-handler';

export default createAtcAgent({
  model: process.env['OPENAI_MODEL'] ?? 'gpt-5-mini',
  reasoningEffort: parseReasoningEffort(process.env['OPENAI_REASONING_EFFORT']),
});
