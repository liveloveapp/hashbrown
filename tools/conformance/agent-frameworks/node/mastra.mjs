import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
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
  if (!['live', 'buffered', 'background'].includes(profile))
    throw new Error(`Unknown Mastra profile: ${profile}`);
  const responseText =
    profile === 'background' && outcome === 'failure'
      ? 'The weather service is unavailable.'
      : answerText;
  let runtime;
  try {
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
                : profile === 'background' && turn === 2
                  ? []
                  : [
                      { type: 'text-start', id: 'answer' },
                      { type: 'text-delta', id: 'answer', delta: responseText },
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
          ...(profile === 'background'
            ? {
                memory: new Memory({
                  options: {
                    lastMessages: 10,
                    semanticRecall: false,
                    generateTitle: false,
                  },
                }),
              }
            : {}),
          tools: {
            getWeather: createTool({
              id: 'getWeather',
              description: 'Get weather for a city',
              ...(profile === 'background'
                ? { background: { enabled: true, maxRetries: 0 } }
                : {}),
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
        if (profile === 'background')
          runtime = new Mastra({
            agents: { weather: agent },
            storage: new InMemoryStore(),
            backgroundTasks: { enabled: true },
          });
        return new MastraAgent({
          agent,
          streamServerToolCalls: profile === 'live',
          injectA2UITool: false,
          ...(profile === 'background'
            ? { untilIdle: { maxIdleMs: 5000 } }
            : {}),
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
          ...(profile === 'background' ? ['@mastra/memory'] : []),
        ]),
        outcome,
        transport: 'real local Mastra Agent.stream',
      },
    );
    return {
      ...scenario,
      profile:
        profile === 'background' && outcome === 'failure'
          ? 'background-failure'
          : profile,
      expected: {
        ...scenario.expected,
        text: responseText,
        ...(profile === 'background'
          ? {
              activities: [
                {
                  activityType: 'mastra-background-task',
                  content: {
                    toolName: 'getWeather',
                    toolCallId: 'weather-call',
                    status: outcome === 'failure' ? 'failed' : 'completed',
                    outputs: [],
                    args: { city: 'Paris' },
                    ...(outcome === 'failure'
                      ? { error: 'Weather service unavailable' }
                      : { result: 'Paris: 21°C and sunny' }),
                  },
                },
              ],
            }
          : {}),
        calls: (profile === 'background' ? [] : scenario.expected.calls).map(
          (call) => ({
            ...call,
            result: JSON.stringify(call.result),
          }),
        ),
      },
    };
  } finally {
    await runtime?.shutdown({ drainTimeout: 1000 });
  }
}
