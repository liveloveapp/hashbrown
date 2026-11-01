import { useStructuredChat } from '@hashbrownai/react';
import {
  candidateAnswerSchema,
  type CandidateConfiguration,
  candidateSystem,
} from '../candidate-runtime';
import { CandidatePanel, useCandidateEnvironment } from './panel';

/** Direct mounted consumer of the actual public useStructuredChat facade. */
export function StructuredChatLeaf({
  config,
}: {
  config: CandidateConfiguration;
}) {
  const environment = useCandidateEnvironment(config);

  const result = useStructuredChat({
    system: candidateSystem,
    tools: environment.tools,
    transport: environment.runtime.transport,
    threadId: config.threadId,
    schema: candidateAnswerSchema,
    debounceTime: 0,
    retries: 0,
  });
  return (
    <CandidatePanel
      config={config}
      pending={result.pendingConversationRecovery}
      recovery={result.recovery}
      data={{
        messages: result.messages,
        state: result.state,
        isLoading: result.isLoading,
        isResuming: result.isResuming,
        error: result.error
          ? { name: result.error.name, message: result.error.message }
          : null,
        ...environment.runtime.observations(),
      }}
      actions={{
        start: (prompt) =>
          result.sendMessage({ role: 'user', content: prompt }),
        next: (prompt) => result.sendMessage({ role: 'user', content: prompt }),
        stop: () => result.stop(),
        configuration: () => result.getRecoveryConfiguration(),
        restore: (snapshot, options) =>
          result.restoreConversation(snapshot, options),
        settle: (options) => result.resumeConversationRecovery(options),

        negatives: {
          'negative-resume': () =>
            result.resume({
              batchId: result.pendingInterrupts?.id ?? '',
              entries: [],
            }),
          'negative-generate': () => result.reload(),
          'negative-set-state': () => result.setState({ candidate: true }),
          'negative-send': () =>
            result.sendMessage({ role: 'user', content: config.nextPrompt }),
          'negative-set-messages': () => result.setMessages([]),
        },
      }}
    >
      <pre data-testid="messages">{JSON.stringify(result.messages)}</pre>
    </CandidatePanel>
  );
}
