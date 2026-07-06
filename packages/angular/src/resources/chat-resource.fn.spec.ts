import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { chatResource } from './chat-resource.fn';

test('chatResource initializes with the provided message history', () => {
  const messages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const chat = TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      system: 'You are a helpful assistant.',
      messages,
    }),
  );

  expect(chat.value()).toEqual(messages);
});

test('chatResource allows replacing message history', () => {
  const initialMessages = [
    {
      role: 'user' as const,
      content: 'Summarize the previous order.',
    },
  ];
  const nextMessages = [
    {
      role: 'user' as const,
      content: 'Keep only this follow-up.',
    },
  ];

  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat' })],
  });

  const chat = TestBed.runInInjectionContext(() =>
    chatResource({
      model: 'gpt-4.1',
      system: 'You are a helpful assistant.',
      messages: initialMessages,
    }),
  );

  chat.setMessages(nextMessages);

  expect(chat.value()).toEqual(nextMessages);
});
