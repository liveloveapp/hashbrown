import { useUiChat } from '@hashbrownai/react';
import {
  type CandidateConfiguration,
  candidateSystem,
} from '../candidate-runtime';
import { CandidatePanel, useCandidateEnvironment } from './panel';
import { candidateComponents } from './candidate-card';

/** Direct mounted consumer of the actual public useUiChat facade. */
export function UiChatLeaf({ config }: { config: CandidateConfiguration }) {
  const environment = useCandidateEnvironment(config);

  const result = useUiChat({
    system: candidateSystem,
    tools: environment.tools,
    transport: environment.runtime.transport,
    threadId: config.threadId,
    components: candidateComponents,
  });
  return (
    <CandidatePanel
      config={config}
      pending={result.pendingConversationRecovery}
      recovery={result.recovery}
      data={{
        messages: result.messages.map((message) =>
          message.role === 'assistant'
            ? { ...message, ui: undefined }
            : message,
        ),
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
      {result.messages.map((message, index) =>
        message.role === 'assistant' ? (
          <section key={index}>{message.ui}</section>
        ) : null,
      )}
    </CandidatePanel>
  );
}
