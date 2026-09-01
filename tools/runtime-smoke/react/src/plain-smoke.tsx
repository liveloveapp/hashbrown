import { s } from '@hashbrownai/core';
import { useChat, useTool } from '@hashbrownai/react';
import { useState } from 'react';

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
  const [submitted, setSubmitted] = useState('');
  const [toolCount, setToolCount] = useState(0);
  const getWeather = useTool({
    name: 'getWeather',
    description: 'Get the current weather for a city.',
    schema: s.object('Weather lookup', {
      city: s.string('The city to get weather for'),
    }),
    handler: async ({ city }) => {
      setToolCount((count) => count + 1);

      return { city, temperatureC: 21, condition: 'sunny' };
    },
    deps: [],
  });
  const {
    error,
    generatingError,
    isLoading,
    lastAssistantMessage,
    messages,
    sendMessage,
    sendingError,
    stop,
  } = useChat({
    system: 'Runtime smoke system prompt.',
    tools: scenario === 'tool' ? [getWeather] : [],
  });
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
    setSubmitted(prompt);
    sendMessage({ role: 'user', content: prompt });
  }

  return (
    <section>
      <input
        data-testid="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button data-testid="send" type="button" onClick={send}>
        Send
      </button>
      <button data-testid="stop" type="button" onClick={() => stop()}>
        Stop
      </button>
      <div data-testid="status">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="user-message">{submitted}</div>
      <div data-testid="assistant">{lastAssistantMessage?.content ?? ''}</div>
      <div data-testid="error">{errorText(error)}</div>
      <div data-testid="sending-error">{errorText(sendingError)}</div>
      <div data-testid="generating-error">{errorText(generatingError)}</div>
      <div data-testid="tool-count">{toolCount}</div>
      <div data-testid="reasoning">{reasoningText}</div>
      <div data-testid="reasoning-detail-count">{reasoningDetails.length}</div>
      <div data-testid="reasoning-has-opaque-value">
        {reasoningHasOpaqueValue ? 'true' : 'false'}
      </div>
    </section>
  );
}
