import { s } from '@hashbrownai/core';
import { useTool } from '@hashbrownai/react';
import type { HumanMessage, Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useState } from 'react';
import { useUiPlanAgent } from './ui-plan-agent';

export const useLangGraphPlanAgent = () => {
  const [threadId, setThreadId] = useState<string | null>(null);
  const stream = useStream<{ messages: Message[] }>({
    assistantId: 'plan',
    apiUrl: 'http://localhost:2024',
    threadId,
    onThreadId: setThreadId,
    reconnectOnMount: () => window.localStorage,
  });

  const planAgentTool = useTool({
    name: 'plan',
    description: 'A pilot agent and flight planning expert.',
    handler: async (input: { query: string }, abortSignal: AbortSignal) => {
      if (abortSignal.aborted) {
        throw new Error('Plan agent request was aborted');
      }

      const message: HumanMessage = {
        type: 'human',
        content: input.query,
      };

      const onAbort = () => {
        void stream.stop();
      };
      abortSignal.addEventListener('abort', onAbort);

      try {
        await stream.submit({
          messages: [message],
        });

        console.log('values', stream.values);

        const aiMessages = stream.messages.filter((m) => m.type === 'ai');
        const lastAiMessage = aiMessages.at(-1);

        if (!lastAiMessage) {
          return 'No response from plan agent';
        }

        console.log('lastAiMessage', lastAiMessage);

        const content =
          typeof lastAiMessage.content === 'string'
            ? lastAiMessage.content
            : JSON.stringify(lastAiMessage.content);

        return content;
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
      }
    },
    deps: [stream.submit, stream.stop],
    schema: s.object('Plan agent input', {
      query: s.string('The query to plan a flight'),
    }),
  });

  const { agent } = useUiPlanAgent({ tools: [planAgentTool] });

  return { agent };
};
