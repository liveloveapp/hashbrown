import { useState } from 'react';
import { useChat } from '@hashbrownai/react';
import {
  beginCandidateConfigAction,
  type CandidateConfiguration,
  candidateSystem,
} from '../candidate-runtime';
import { CandidatePanel, useCandidateEnvironment } from './panel';

/** Direct mounted consumer of the actual public useChat facade. */
export function ChatLeaf({ config }: { config: CandidateConfiguration }) {
  const environment = useCandidateEnvironment(config);
  const [system, setSystem] = useState(candidateSystem);

  const result = useChat({
    system,
    tools: environment.tools,
    transport: environment.runtime.transport,
    threadId: config.threadId,
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
          'negative-config': () => {
            const epoch = beginCandidateConfigAction();
            setSystem(`${candidateSystem} changed ${epoch}`);
          },
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
