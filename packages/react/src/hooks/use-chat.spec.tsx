import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { HashbrownProvider } from '../hashbrown-provider';
import { useChat } from './use-chat';

test('useChat initializes with the provided message history', () => {
  const messages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];

  const { result } = renderHook(
    () =>
      useChat({
        model: 'gpt-4.1',
        system: 'You are a helpful assistant.',
        messages,
      }),
    { wrapper: ProviderWrapper },
  );

  expect(result.current.messages).toEqual(messages);
});

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <HashbrownProvider url="/chat">{children}</HashbrownProvider>;
}
