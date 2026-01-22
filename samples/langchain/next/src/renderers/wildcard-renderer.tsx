import { ToolCallStatus } from '@copilotkitnext/core';
import { defineToolCallRenderer, useAgent } from '@copilotkitnext/react';
import { useMemo } from 'react';
import Tool from '../components/chat/Tool';

// Mapping from tool names to step names
const TOOL_TO_STEP_MAP: Record<string, string> = {
  get_airport: 'airport',
  get_metar: 'weather',
  retrieve_phak: 'phak',
  retrieve_poh: 'poh',
};

function WildcardRendererComponent({
  params,
}: {
  params: { name: string; status: ToolCallStatus };
}) {
  const { agent } = useAgent({
    agentId: 'plan',
    updates: ['OnStateChanged' as any],
  });

  // Find the matching step for this tool
  const stepName = TOOL_TO_STEP_MAP[params.name];
  const matchingStep = useMemo(() => {
    if (!stepName) {
      return null;
    }
    const steps = agent.state?.steps ?? [];
    // Find the first step that matches the tool's step name
    return (
      steps.find(
        (step: { step: string; prompt?: string; reason?: string }) =>
          step.step === stepName,
      ) ?? null
    );
  }, [stepName, agent.state?.steps]);

  const stepText = matchingStep
    ? matchingStep.prompt || matchingStep.reason
    : undefined;

  return <Tool params={params} stepText={stepText} />;
}

export const wildcardRenderer = defineToolCallRenderer({
  name: '*',
  render: function WildcardRenderer(params) {
    return <WildcardRendererComponent params={params} />;
  },
});
