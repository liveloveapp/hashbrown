import { useState } from 'react';
import { useUiCompletion } from '@hashbrownai/react';
import {
  type CandidateConfiguration,
  candidateSystem,
} from '../candidate-runtime';
import { CandidatePanel, useCandidateEnvironment } from './panel';
import { candidateComponents } from './candidate-card';

/** Direct mounted consumer of the actual public useUiCompletion facade. */
export function UiCompletionLeaf({
  config,
}: {
  config: CandidateConfiguration;
}) {
  const environment = useCandidateEnvironment(config);
  const [input, setInput] = useState<string | undefined>(undefined);
  const result = useUiCompletion({
    system: candidateSystem,
    tools: environment.tools,
    transport: environment.runtime.transport,
    threadId: config.threadId,
    input,
    components: candidateComponents,
    retries: 0,
  });
  return (
    <CandidatePanel
      config={config}
      pending={result.pendingConversationRecovery}
      recovery={result.recovery}
      data={{
        output: result.output ? { ...result.output, ui: undefined } : null,
        rawOutput: result.rawOutput,
        state: result.state,
        isLoading: result.isLoading,
        isResuming: result.isResuming,
        error: result.error
          ? { name: result.error.name, message: result.error.message }
          : null,
        ...environment.runtime.observations(),
      }}
      actions={{
        start: (prompt) => setInput(prompt),
        next: (prompt) => setInput(prompt),
        stop: () => result.stop(),
        configuration: () => result.getRecoveryConfiguration(),
        restore: (snapshot, options) =>
          result.restoreConversation(snapshot, options),
        settle: (options) => result.resumeConversationRecovery(options),
        restored: () => setInput(config.prompt),
        negatives: {
          'negative-resume': () =>
            result.resume({
              batchId: result.pendingInterrupts?.id ?? '',
              entries: [],
            }),
          'negative-generate': () => result.reload(),
          'negative-set-state': () => result.setState({ candidate: true }),
        },
      }}
    >
      {result.ui}
    </CandidatePanel>
  );
}
