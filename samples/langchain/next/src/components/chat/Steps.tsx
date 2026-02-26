'use client';

import MagicTextRenderer from './MagicTextRenderer';
import styles from './Steps.module.css';

export type Step = { prompt?: string; reason?: string };

interface StepsProps {
  steps?: Step[];
}

function Steps({ steps = [] }: StepsProps) {
  const currentStep = steps[0];

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
