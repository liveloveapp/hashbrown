'use client';

import { useMemo } from 'react';
import { useAgent } from '@copilotkitnext/react';
import MagicTextRenderer from './MagicTextRenderer';
import styles from './Steps.module.css';

function Steps() {
  const { agent } = useAgent({
    agentId: 'plan',
    updates: ['OnStateChanged' as any],
  });
  const steps = useMemo(() => agent.state?.steps ?? [], [agent.state?.steps]);
  const currentStep = useMemo(() => steps[0], [steps]);

  if (steps.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.thinking}>
          <MagicTextRenderer
            text="Thinking..."
            unit="word"
            fragmentDuration={500}
          />
        </div>
      </div>
    );
  }

  if (!currentStep) {
    return null;
  }

  const stepText = currentStep.prompt || currentStep.reason || '';

  return (
    <div className={styles.container}>
      <div className={styles.stepText}>
        <MagicTextRenderer text={stepText} unit="word" fragmentDuration={500} />
      </div>
    </div>
  );
}

Steps.displayName = 'Steps';

export default Steps;
