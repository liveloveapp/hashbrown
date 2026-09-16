import { s } from '@hashbrownai/core';
import { useStructuredCompletion, useTool } from '@hashbrownai/react';
import { useState } from 'react';
import { InterruptControls } from './interrupt-controls';

const answerSchema = s.object('Runtime completion answer', {
  answer: s.streaming.string('Answer text'),
  count: s.number('Result count'),
});

/** Exercises reactive completion input across interruption and local tool execution. */
export function CompletionSmoke() {
  const [input, setInput] = useState('');
  const [toolCount, setToolCount] = useState(0);
  const getWeather = useTool({
    name: 'getWeather',
    description: 'Get the current weather for a city.',
    schema: s.object('Weather lookup', { city: s.string('City') }),
    handler: async ({ city }) => {
      setToolCount((count) => count + 1);
      return { city, temperatureC: 21 };
    },
    deps: [],
  });
  const completion = useStructuredCompletion({
    input,
    system: 'Runtime smoke system prompt.',
    schema: answerSchema,
    tools: [getWeather],
    debounceTime: 0,
    retries: 0,
  });

  return (
    <section>
      <input
        data-testid="completion-input"
        value={input}
        onChange={(event) => setInput(event.currentTarget.value)}
      />
      <InterruptControls
        batch={completion.pendingInterrupts}
        isResuming={completion.isResuming}
        resume={completion.resume}
      />
      <div data-testid="structured-answer">
        {completion.output?.answer ?? ''}
      </div>
      <div data-testid="tool-count">{toolCount}</div>
      <div data-testid="error">{completion.error?.message ?? ''}</div>
    </section>
  );
}
