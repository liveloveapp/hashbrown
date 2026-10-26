import { useChat } from '@hashbrownai/react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { RequestTransform } from '../../examples/quickstart/react/src/RequestTransform';

vi.mock('@hashbrownai/react', () => ({ useChat: vi.fn() }));
function mockChat(overrides: Record<string, unknown> = {}) {
  const chat = {
    messages: [],
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isLoading: false,
    error: undefined,
    setMessages: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
  vi.mocked(useChat).mockReturnValue(
    chat as unknown as ReturnType<typeof useChat>,
  );
  return chat;
}

test('starts with an explicit support question and no automatic request', () => {
  const chat = mockChat();

  const html = renderToStaticMarkup(<RequestTransform />);

  expect(html).toContain('How quickly will our team get support?');
  expect(html).toContain('Ask the assistant');
  expect(html).toContain('Support reply');
  expect(chat.setMessages).not.toHaveBeenCalled();
});

test('all busy phases permit cancellation and disable another request', () => {
  for (const phase of [
    'isSending',
    'isReceiving',
    'isGenerating',
    'isLoading',
  ]) {
    mockChat({ [phase]: true });

    const html = renderToStaticMarkup(<RequestTransform />);

    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Ask the assistant<\/button>/,
    );
    expect(html).toMatch(/<button type="button">Cancel<\/button>/);
  }
});

test('a failure withholds an old reply and provides an explicit retry', () => {
  mockChat({
    error: new Error('PRIVATE'),
    messages: [{ role: 'assistant', content: 'OLD' }],
  });

  const html = renderToStaticMarkup(<RequestTransform />);

  expect(html).toContain('Ask the assistant to try again');
  expect(html).not.toContain('PRIVATE');
  expect(html).not.toContain('OLD');
});

test('both frameworks use ordinary chat, fresh user-only messages and cancellation', () => {
  const sources = [
    'react/src/RequestTransform.tsx',
    'angular/src/app/request-transform.ts',
  ].map((path) =>
    readFileSync(
      new URL(`../../examples/quickstart/${path}`, import.meta.url),
      'utf8',
    ),
  );

  for (const source of sources) {
    expect(source).toContain('/api/transformed-chat');
    expect(source).toContain('.setMessages([');
    expect(source).toContain("role: 'user'");
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('.stop()');
    for (const phase of [
      'isSending',
      'isReceiving',
      'isGenerating',
      'isLoading',
    ])
      expect(source).toContain(phase);
  }
});
