import { useAgent } from '@copilotkitnext/react';
import { s } from '@hashbrownai/core';
import { useTool } from '@hashbrownai/react';
import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

export const useCopilotKitPlanAgent = () => {
  const { agent } = useAgent({ agentId: 'plan' });
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      agent.abortRun();
    };
  }, [agent]);

  useEffect(() => {
    const subscription = agent.subscribe({
      onMessagesChanged: ({ messages }) => {
        console.log('🟢 onMessagesChanged', messages);
      },
      onRunInitialized: (params) => {
        console.log('🟡 onRunInitialized', params);
      },
      onRunFinalized: (params) => {
        console.log('🟢 onRunFinalized', params);
      },
      onRunFailed: (params) => {
        console.log('❌ onRunFailed', params);
      },
    });

    return () => subscription.unsubscribe();
  }, [agent]);

  const submit = useCallback(
    async (input?: {
      messages?: Array<{ type: string; content: unknown }>;
    }) => {
      const lastMessage = input?.messages?.at(-1);
      if (!lastMessage) {
        return;
      }

      const text =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      if (!text) {
        return;
      }

      agent.addMessage({
        id: uuidv4(),
        role: 'user',
        content: text,
      });

      const abortController = new AbortController();
      abortControllerRef.current?.abort();
      abortControllerRef.current = abortController;

      // Connect the abort signal to the agent's abort mechanism
      const onAbort = () => {
        agent.abortRun();
      };
      abortController.signal.addEventListener('abort', onAbort);

      try {
        await agent.runAgent();
      } finally {
        abortController.signal.removeEventListener('abort', onAbort);
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [agent],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    agent.abortRun();
  }, [agent]);

  const updatePlanTool = useTool({
    name: 'update_plan',
    description: "Update the plan with the user's query.",
    handler: async (input: { query: string }, abortSignal: AbortSignal) => {
      if (abortSignal.aborted) {
        throw new Error('Plan agent request was aborted');
      }

      const onAbort = () => {
        stop();
      };
      abortSignal.addEventListener('abort', onAbort);

      try {
        await submit({
          messages: [{ type: 'human', content: input.query }],
        });
        return agent.state;
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
      }
    },
    deps: [stop, submit],
    schema: s.object('Plan agent input', {
      query: s.string("The user's query to update the plan"),
    }),
  });

  const readPlanTool = useTool({
    name: 'read_plan',
    description: 'Read the current state of the plan',
    handler: () => {
      return agent.state;
    },
    deps: [agent.state],
  });

  return { agent, updatePlanTool, readPlanTool, stop };
};
