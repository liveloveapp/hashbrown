import { s } from '@hashbrownai/core';
import { useChat, useTool } from '@hashbrownai/react';
import { useState } from 'react';
import { InterruptControls } from './interrupt-controls';
import { useRecoveryControls, useRecoveryThread } from './recovery-controls';
import { rememberThread } from './recovery';

interface PlainSmokeProps {
  readonly scenario: 'plain' | 'tool';
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

/** Plain React chat fixture used by the shared runtime smoke scenarios. */
export function PlainSmoke({ scenario }: PlainSmokeProps) {
  const [prompt, setPrompt] = useState('');
  const { threadId, setThreadId } = useRecoveryThread();
  const [commandError, setCommandError] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [toolObservations, setToolObservations] = useState<readonly string[]>(
    [],
  );
  const getWeather = useTool({
    name: 'getWeather',
    description: 'Get the current weather for a city.',
    schema: s.object('Weather lookup', {
      city: s.string('The city to get weather for'),
    }),
    handler: async ({ city }) => {
      setToolObservations((entries) => {
        if (entries.length >= 128)
          throw new Error('Fixture tool observation capacity exceeded');
        return [...entries, city];
      });

      return { city, temperatureC: 21, condition: 'sunny' };
    },
    deps: [],
  });
  const chat = useChat({
    system: 'Runtime smoke system prompt.',
    threadId,
    tools: scenario === 'tool' ? [getWeather] : [],
  });
  const recovery = useRecoveryControls(chat, threadId, setThreadId);
  const {
    error,
    state,
    pendingInterrupts,
    isResuming,
    resume,
    generatingError,
    isLoading,
    lastAssistantMessage,
    messages,
    sendMessage,
    sendingError,
    stop,
  } = chat;
  const reasoningMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' && message.reasoningDetails !== undefined,
    );
  const reasoningDetails =
    reasoningMessage?.role === 'assistant'
      ? (reasoningMessage.reasoningDetails ?? [])
      : [];
  const reasoningText = reasoningDetails
    .map((detail) => detail.content)
    .filter((content) => content.length > 0)
    .join('\n\n');
  const reasoningHasOpaqueValue = reasoningDetails.some((detail) =>
    Boolean(detail.encryptedValue),
  );

  function send() {
    rememberThread(threadId);
    setSubmitted(prompt);
    setCommandError('');
    try {
      sendMessage({ role: 'user', content: prompt });
    } catch (cause) {
      setCommandError(errorText(cause));
    }
  }

  return (
    <section>
      <input
        data-testid="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        data-testid="send"
        type="button"
        disabled={recovery.disabled}
        onClick={send}
      >
        Send
      </button>
      <button data-testid="stop" type="button" onClick={() => stop()}>
        Stop
      </button>
      <InterruptControls
        disabled={recovery.disabled}
        batch={pendingInterrupts}
        isResuming={isResuming}
        resume={resume}
      />
      <button
        data-testid="new-thread"
        type="button"
        onClick={recovery.newThread}
      >
        New thread
      </button>
      {recovery.enabled && (
        <button
          data-testid="refresh-recovery"
          disabled={recovery.fetching || isLoading}
          onClick={() => void recovery.refresh()}
        >
          Refresh recovery
        </button>
      )}
      {recovery.enabled && (
        <button
          data-testid="replay-last-restore"
          type="button"
          disabled={
            recovery.fetching || isLoading || !recovery.canReplayRestore
          }
          onClick={recovery.replayLastRestore}
        >
          Replay last restore command
        </button>
      )}
      <div data-testid="recovery-command-error">{recovery.commandError}</div>
      <div data-testid="recovery-status">{recovery.status}</div>
      <div data-testid="recovery-fetching">{String(recovery.fetching)}</div>
      <div data-testid="recovery-required">
        {String(chat.recovery.required)}
      </div>
      <div data-testid="recovery-thread">{threadId}</div>
      {chat.recovery.diagnostics?.map((diagnostic) => (
        <pre
          key={diagnostic.messageId}
          data-testid="recovery-diagnostic"
          data-message-id={diagnostic.messageId}
          data-thread-id={diagnostic.threadId}
          data-kind={diagnostic.kind}
        >
          {diagnostic.content}
        </pre>
      ))}
      <div data-testid="shared-state">{JSON.stringify(state)}</div>
      <div data-testid="command-error">{commandError}</div>
      <div data-testid="status">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="user-message">{submitted}</div>
      <div data-testid="assistant">{lastAssistantMessage?.content ?? ''}</div>
      <div data-testid="error">{errorText(error)}</div>
      <div data-testid="sending-error">{errorText(sendingError)}</div>
      <div data-testid="generating-error">{errorText(generatingError)}</div>
      <pre data-testid="server-tool-calls">
        {JSON.stringify(
          messages.flatMap((message) =>
            message.role === 'assistant' ? (message.serverToolCalls ?? []) : [],
          ),
        )}
      </pre>
      <pre data-testid="activity-messages">
        {JSON.stringify(
          messages.filter((message) => message.role === 'activity'),
        )}
      </pre>
      <div data-testid="tool-count">{toolObservations.length}</div>
      <div data-testid="tool-observations">
        {JSON.stringify(toolObservations)}
      </div>
      <div data-testid="reasoning">{reasoningText}</div>
      <div data-testid="reasoning-detail-count">{reasoningDetails.length}</div>
      <div data-testid="reasoning-has-opaque-value">
        {reasoningHasOpaqueValue ? 'true' : 'false'}
      </div>
    </section>
  );
}
