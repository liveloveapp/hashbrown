'use client';

import { prompt, s } from '@hashbrownai/core';
import { useTool, useUiChat, useUiCompletion } from '@hashbrownai/react';
import { HumanMessage, Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Chat from '../../components/chat/Chat';
import { Step } from '../../components/chat/Steps';
import InfiniteLoader from '../../components/layout/InfiniteLoader';
import { useStableObject } from '../../hooks/use-stable-object';
import { exposedHeading } from '../../ui/Heading';
import { exposedOrderedList } from '../../ui/OrderedList';
import { exposedParagraph } from '../../ui/Paragraph';
import { exposedUnorderedList } from '../../ui/UnorderedList';
import { exposedWeather } from '../../ui/Weather';
import styles from './page.module.css';

export default function LangGraphPage() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const stream = useStream<{ messages: Message[]; steps: Step[] }>({
    assistantId: 'plan',
    apiUrl: 'http://localhost:2024',
    threadId,
    onThreadId: setThreadId,
    reconnectOnMount: () => window.localStorage,
  });
  const retrievalValue = useMemo(() => {
    if (stream.isLoading || stream.isThreadLoading) {
      return null;
    }
    return stream.values;
  }, [stream.isLoading, stream.isThreadLoading, stream.values]);
  const retrieval = useStableObject(retrievalValue);

  useEffect(() => {
    console.log('retrieval', retrieval);
  }, [retrieval]);

  const updatePlanTool = useTool({
    name: 'update_plan',
    description: "Update the plan with the user's query.",
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
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
      }
    },
    deps: [stream],
    schema: s.object('Plan agent input', {
      query: s.string("The user's query to update the plan"),
    }),
  });

  const readPlanTool = useTool({
    name: 'read_plan',
    description: 'Read the current state of the plan',
    handler: async () => {
      return retrieval;
    },
    deps: [retrieval],
  });

  const collaboratePlanAgent = useUiChat({
    model: 'gpt-5-chat-latest',
    debugName: 'collaborate-plan-agent',
    system: prompt`
      You are a pilot agent and flight planning expert.

      **Instructions**

      You must first call the "update_plan" tool and provide the agent with the user's query.
      Use the "read_plan" tool to read the current state of the remote agent.
      
      **Examples**

      <user>What is the weather at KBDN?</user>
      <assistant>
        <tool-call>update_plan</tool-call>
      </assistant>
      <assistant>
        <ui>
          <h level="2" text="The current conditions at KBDN" />
          <p text="METAR and TAF details and key weather information" citations=${[]} />
        </ui>
      </assistant>
    `,
    tools: [updatePlanTool, readPlanTool],
    components: [
      exposedHeading,
      exposedParagraph,
      exposedOrderedList,
      exposedUnorderedList,
    ],
  });

  const renderPlanAgent = useUiCompletion({
    model: 'gpt-5.1',
    debugName: 'render-plan-agent',
    input: retrieval,
    system: prompt`
      You render the plan user interface using the available components.

      Examples

      <user>What is the weather at KBDN?</user>
      <assistant>
        <ui>
          <Weather icao="KBDN" metar="KBDN 123456 123456 123456" taf="KBDN 123456 123456 123456" ceilingFt=${10000} visibilitySm=${10} summary="Sunny" windDirectionDeg=${270} windSpeedKt=${15} temperatureC=${22} dewpointC=${18} altimeterInHg=${29.92} />
        </ui>
      </assistant>

      The examples above are only for reference. You must not use them in your response.
    `,
    components: [exposedWeather],
  });

  const onStop = useCallback(() => {
    void stream.stop();
  }, [stream.stop]);

  const rendering = useMemo(() => {
    return (
      collaboratePlanAgent.isRunningToolCalls ||
      renderPlanAgent.isSending ||
      renderPlanAgent.isReceiving
    );
  }, [
    collaboratePlanAgent.isRunningToolCalls,
    renderPlanAgent.isSending,
    renderPlanAgent.isReceiving,
  ]);

  const isRunning = useMemo(() => {
    return (
      stream.isLoading ||
      stream.isThreadLoading ||
      collaboratePlanAgent.isRunningToolCalls ||
      collaboratePlanAgent.isSending ||
      collaboratePlanAgent.isReceiving
    );
  }, [
    collaboratePlanAgent.isReceiving,
    collaboratePlanAgent.isRunningToolCalls,
    collaboratePlanAgent.isSending,
    stream.isLoading,
    stream.isThreadLoading,
  ]);

  return (
    <main className={styles.main}>
      <section className={styles.ui}>
        {rendering ? <InfiniteLoader /> : renderPlanAgent.ui}
      </section>
      <section className={styles.chat}>
        <Chat
          agent={collaboratePlanAgent}
          isRunning={isRunning}
          onStop={onStop}
          remoteAgentIsRunning={stream.isLoading || stream.isThreadLoading}
          remoteAgentSteps={stream.values?.steps ?? []}
          remoteAgentMessages={stream.values?.messages ?? []}
        />
      </section>
    </main>
  );
}
