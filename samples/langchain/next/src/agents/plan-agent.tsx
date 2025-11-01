import { s } from '@hashbrownai/core';
import { exposeComponent, useTool, useUiChat } from '@hashbrownai/react';
import type { HumanMessage, Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useEffect, useState } from 'react';
import { Markdown } from '../components/markdown';

const DEFAULT_LANGGRAPH_API_URL = 'http://localhost:2024';
interface UsePlanAgentOptions {
  assistantId: string;
  apiUrl?: string;
}

function getMessageContentText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

export const usePlanAgent = ({
  assistantId,
  apiUrl: apiUrlOverride,
}: UsePlanAgentOptions) => {
  const [threadId, setThreadId] = useState<string | null>(null);
  const apiUrl =
    apiUrlOverride ??
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ??
    DEFAULT_LANGGRAPH_API_URL;

  const stream = useStream<{ messages: Message[] }>({
    assistantId,
    apiUrl,
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
        stream.submit({
          messages: [message],
        });
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
      }
    },
    deps: [stream.submit, stream.stop],
    schema: s.object('Plan agent input', {
      query: s.string('The query to plan a flight'),
    }),
  });

  const exposedMarkdown = exposeComponent(Markdown, {
    name: 'Markdown',
    description: 'Show markdown to the user',
    children: 'text' as const,
  });

  const agent = useUiChat({
    model: 'gpt-4.1',
    debugName: 'plan-agent',
    system: `
    
You are a pilot agent and flight planning expert.

## Tools

- plan: provides flight planning, aviation knowledge, and weather information to the user.

`,
    tools: [planAgentTool],
    components: [exposedMarkdown],
  });

  useEffect(() => {
    if (stream.isLoading || stream.messages.length === 0) {
      return;
    }

    const messages = stream.messages.filter((m) => m.type === 'ai');
    agent.setMessages(
      messages.map((m) => ({
        role: 'user',
        content: m.content,
      })),
    );
  }, [agent, stream.isLoading, stream.messages]);

  return { agent, stream };
};
