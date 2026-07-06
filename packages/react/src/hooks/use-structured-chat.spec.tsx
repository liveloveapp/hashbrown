import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { s } from '@hashbrownai/core';
import { HashbrownProvider } from '../hashbrown-provider';
import { useStructuredChat } from './use-structured-chat';

test('useStructuredChat initializes with the provided message history', () => {
  const messages = [
    {
      role: 'user' as const,
      content: 'What is the current portfolio risk?',
    },
  ];

  const { result } = renderHook(
    () =>
      useStructuredChat({
        model: 'gpt-4.1',
        system: 'You are a portfolio analyst.',
        schema: s.object('risk summary', {
          risk: s.string('Risk level'),
        }),
        messages,
      }),
    { wrapper: ProviderWrapper },
  );

  expect(result.current.messages).toEqual(messages);
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}
