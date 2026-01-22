'use client';

import { useRenderToolCall } from '@copilotkitnext/react';
import { prompt } from '@hashbrownai/core';
import { useUiChat, useUiCompletion } from '@hashbrownai/react';
import { useMemo } from 'react';
import { useCopilotKitPlanAgent } from '../../agents/copilotkit-plan-agent';
import Chat from '../../components/chat/Chat';
import InfiniteLoader from '../../components/layout/InfiniteLoader';
import { exposedHeading } from '../../ui/Heading';
import { exposedOrderedList } from '../../ui/OrderedList';
import { exposedParagraph } from '../../ui/Paragraph';
import { exposedUnorderedList } from '../../ui/UnorderedList';
import { exposedWeather } from '../../ui/Weather';
import styles from './page.module.css';

export default function CopilotKitPage() {
  const {
    agent: researchPlanAgent,
    updatePlanTool,
    readPlanTool,
    stop,
  } = useCopilotKitPlanAgent();
  const renderToolCall = useRenderToolCall();

  const collaboratePlanAgent = useUiChat({
    model: 'gpt-5-chat-latest',
    debugName: 'collaborate-plan-agent',
    system: prompt`
      You are a pilot agent and flight planning expert.

      **Instructions**
      
      1. You must call the "update_plan" tool and provide the agent with the user's query.
      2. You can call the "read_plan" tool to read the current state of the agent.
      3. If the user asks for information that is not available, you must call the "update_plan" tool to update the agent with the user's query.
      
      Today's date is ${new Date().toISOString()}.

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

  const retrieval = useMemo(() => {
    if (researchPlanAgent.isRunning) {
      return null;
    }
    return researchPlanAgent.state?.retrieval;
  }, [researchPlanAgent.isRunning, researchPlanAgent.state?.retrieval]);

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
      researchPlanAgent.isRunning ||
      collaboratePlanAgent.isRunningToolCalls ||
      collaboratePlanAgent.isSending ||
      collaboratePlanAgent.isReceiving
    );
  }, [
    researchPlanAgent.isRunning,
    collaboratePlanAgent.isRunningToolCalls,
    collaboratePlanAgent.isSending,
    collaboratePlanAgent.isReceiving,
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
          onStop={stop}
          remoteAgentIsRunning={researchPlanAgent.isRunning}
          remoteAgentSteps={researchPlanAgent.state?.steps ?? []}
          remoteAgentMessages={researchPlanAgent.messages}
          renderToolCall={renderToolCall}
        />
      </section>
    </main>
  );
}
