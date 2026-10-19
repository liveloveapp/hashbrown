import { s } from '@hashbrownai/core';
import { useDecision, useUiDecision } from '@hashbrownai/react';
import { useState } from 'react';

const routeSchema = s.object('Route', {
  intent: s.enumeration('Intent', { filter: 'Filter', chat: 'Chat' }),
  clear: s.boolean('Clear'),
});

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return error === undefined ? '' : String(error);
}

const candidates = [
  {
    id: 'weather',
    description: 'Weather questions',
    element: <div data-testid="candidate-weather">Weather card</div>,
  },
  {
    id: 'stocks',
    description: 'Stock questions',
    element: <div data-testid="candidate-stocks">Stocks card</div>,
  },
];

/** React decision fixture used by the shared decisions conformance suite. */
export function DecisionSmoke() {
  const [text, setText] = useState('');
  const input = text === '' ? null : text;
  const route = useDecision({ schema: routeSchema, input });
  const picked = useUiDecision({ input, candidates, select: 'one' });

  return (
    <section>
      <input
        data-testid="decision-input"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <div data-testid="decision-intent">{route.value?.intent ?? ''}</div>
      <div data-testid="decision-clear">
        {route.value ? String(route.value.clear) : ''}
      </div>
      <div data-testid="decision-confidence">
        {route.meta ? String(route.meta.intent.confidence) : ''}
      </div>
      <div data-testid="decision-error">{errorText(route.error)}</div>
      <div data-testid="candidate-ids">{picked.ids.join(',')}</div>
      {picked.ui}
    </section>
  );
}
