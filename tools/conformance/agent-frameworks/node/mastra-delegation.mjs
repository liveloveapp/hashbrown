import { Agent } from '@mastra/core/agent';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { MastraAgent } from '@ag-ui/mastra';
import { captureEvents } from './capture.mjs';
import { installedVersions, answerText } from './scenario.mjs';

/** Execute native Mastra agent delegation; never invent AG-UI lifecycle or provenance. */
export async function runMastraDelegationScenario() {
  let parentTurns = 0;
  let childModelExecutions = 0;
  const text = [
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: answerText },
    { type: 'text-end', id: 'answer' },
  ];
  const model = (parts) =>
    new MastraLanguageModelV2Mock({
      doStream: async () => {
        const chunks = parts();
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              chunks.forEach((chunk) => controller.enqueue(chunk));
              controller.enqueue({
                type: 'finish',
                finishReason: chunks === text ? 'stop' : 'tool-calls',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              });
              controller.close();
            },
          }),
        };
      },
    });
  const worker = new Agent({
    id: 'worker',
    name: 'Worker',
    description: 'Answer weather questions',
    instructions: 'Answer the weather question.',
    model: model(() => {
      childModelExecutions++;
      return text;
    }),
  });
  const agent = new Agent({
    id: 'coordinator',
    name: 'Coordinator',
    instructions: 'Delegate to worker then answer.',
    agents: { worker },
    model: model(() =>
      parentTurns++ === 0
        ? [
            {
              type: 'tool-call',
              toolCallId: 'delegate-call',
              toolName: 'agent-worker',
              input: JSON.stringify({
                prompt: 'What is the weather in Paris?',
              }),
            },
          ]
        : text,
    ),
  });
  const bridge = new MastraAgent({
    agent,
    streamServerToolCalls: true,
    injectA2UITool: false,
  });
  const events = await captureEvents(
    bridge.run({
      threadId: 'mastra-delegation-thread',
      runId: 'mastra-delegation-run',
      messages: [
        {
          id: 'question',
          role: 'user',
          content: 'What is the weather in Paris?',
        },
      ],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    }),
  );
  return {
    framework: 'mastra',
    profile: 'native-delegation',
    versions: installedVersions([
      '@ag-ui/mastra',
      '@mastra/core',
      '@mastra/client-js',
      '@ag-ui/core',
    ]),
    events,
    expected: {
      calls: [
        {
          name: 'agent-worker',
          args: { prompt: 'What is the weather in Paris?' },
          resultText: answerText,
        },
      ],
      text: answerText,
    },
    evidence: {
      realFrameworkExecution: true,
      transport:
        'real local Mastra Agent.stream with native agents configuration',
      childModelExecutions,
      parentModelExecutions: parentTurns,
      nativeSubagentAttribution: 'missing-upstream',
      nativeCheckpointRestore: 'not-tested',
    },
  };
}
