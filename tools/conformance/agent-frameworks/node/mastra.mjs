import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { MastraAgent } from '@ag-ui/mastra';
import { captureScenario, installedVersions, answerText } from './scenario.mjs';

/** Runs a real Mastra agent and published AG-UI bridge with a deterministic local model. */
export async function runMastraScenario({
  profile = 'live',
  outcome = 'success',
} = {}) {
  if (!['live', 'buffered'].includes(profile))
    throw new Error(`Unknown Mastra profile: ${profile}`);
  const scenario = await captureScenario(
    async (execute) => {
      let turn = 0;
      const model = new MastraLanguageModelV2Mock({
        doStream: async () => {
          const parts =
            turn++ === 0
              ? [
                  {
                    type: 'tool-input-start',
                    id: 'weather-call',
                    toolName: 'getWeather',
                  },
                  {
                    type: 'tool-input-delta',
                    id: 'weather-call',
                    delta: '{"city":"Paris"}',
                  },
                  { type: 'tool-input-end', id: 'weather-call' },
                  {
                    type: 'tool-call',
                    toolCallId: 'weather-call',
                    toolName: 'getWeather',
                    input: '{"city":"Paris"}',
                  },
                ]
              : [
                  { type: 'text-start', id: 'answer' },
                  { type: 'text-delta', id: 'answer', delta: answerText },
                  { type: 'text-end', id: 'answer' },
                ];
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                parts.forEach((part) => controller.enqueue(part));
                controller.enqueue({
                  type: 'finish',
                  finishReason: turn === 1 ? 'tool-calls' : 'stop',
                  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                });
                controller.close();
              },
            }),
          };
        },
      });
      const agent = new Agent({
        id: 'weather',
        name: 'Weather',
        instructions: 'Use getWeather then answer.',
        model,
        tools: {
          getWeather: createTool({
            id: 'getWeather',
            description: 'Get weather for a city',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
              additionalProperties: false,
            },
            execute: (args, context) =>
              execute(args, { signal: context.abortSignal }),
          }),
        },
      });
      return new MastraAgent({
        agent,
        streamServerToolCalls: profile === 'live',
        injectA2UITool: false,
      });
    },
    {
      live: profile === 'live',
      framework: 'mastra',
      profile,
      versions: installedVersions([
        '@ag-ui/mastra',
        '@mastra/core',
        '@mastra/client-js',
        '@ag-ui/core',
      ]),
      outcome,
      transport: 'real local Mastra Agent.stream',
    },
  );
  return {
    ...scenario,
    expected: {
      ...scenario.expected,
      calls: scenario.expected.calls.map((call) => ({
        ...call,
        result: JSON.stringify(call.result),
      })),
    },
  };
}
