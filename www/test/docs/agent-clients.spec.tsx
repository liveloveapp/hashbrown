import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { useChat } from '@hashbrownai/react';
import { expect, test, vi } from 'vitest';
import { AgentDecisions } from '../../examples/quickstart/react/src/AgentDecisions';

vi.mock('@hashbrownai/react', () => ({ useChat: vi.fn() }));

function mockChat(overrides: Record<string, unknown> = {}) {
  const chat = {
    messages: [],
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isLoading: false,
    error: undefined,
    lastRunFinishReason: undefined,
    setMessages: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
  // This fixture supplies only the hook fields that the example reads.
  vi.mocked(useChat).mockReturnValue(
    chat as unknown as ReturnType<typeof useChat>,
  );
  return chat;
}

test('the agent client starts idle with an explicit customer message and no request', () => {
  const chat = mockChat();

  const html = renderToStaticMarkup(<AgentDecisions />);

  expect(html).toContain('Route a support request');
  expect(html).toContain('Customer message');
  expect(html).toContain('Where is order HB-1042?');
  expect(html).toContain('Run agent');
  expect(html).toContain('Ready');
  expect(html).toContain('aria-label="Agent reply"');
  expect(chat.setMessages).not.toHaveBeenCalled();
  expect(chat.stop).not.toHaveBeenCalled();
});

test('every busy phase disables Run and enables cancellation', () => {
  const phases = ['isSending', 'isReceiving', 'isGenerating', 'isLoading'];

  const rendered = phases.map((phase) => {
    mockChat({ [phase]: true });
    return renderToStaticMarkup(<AgentDecisions />);
  });

  for (const html of rendered) {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Run agent<\/button>/);
    expect(html).toMatch(/<button type="button">Cancel<\/button>/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Running agent');
  }
});

test('the agent reply renders only the latest assistant text and escapes markup', () => {
  mockChat({
    messages: [
      { role: 'assistant', content: 'Old reply' },
      { role: 'user', content: 'New request' },
      { role: 'assistant', content: '<script>customer text</script>' },
    ],
  });

  const html = renderToStaticMarkup(<AgentDecisions />);

  expect(html).toContain('&lt;script&gt;customer text&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Old reply');
});

test('failed runs show an explicit retry path and suppress stale output', () => {
  mockChat({
    error: new Error('internal failure detail'),
    messages: [{ role: 'assistant', content: 'Old reply' }],
  });

  const html = renderToStaticMarkup(<AgentDecisions />);

  expect(html).toContain('Run agent to try again');
  expect(html).not.toContain('internal failure detail');
  expect(html).not.toContain('Old reply');
});

test('both examples use ordinary chat with fresh messages, complete busy flags and cancellation', () => {
  const sources = [
    readFileSync(
      new URL(
        '../../examples/quickstart/react/src/AgentDecisions.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFileSync(
      new URL(
        '../../examples/quickstart/angular/src/app/agent-decisions.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ];

  for (const source of sources) {
    expect(source).toContain('/api/agent');
    expect(source).toContain('.setMessages([');
    expect(source).toContain("role: 'user'");
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('.stop()');
    expect(source).toContain('Stopped. Run agent to start again.');
    for (const phase of [
      'isSending',
      'isReceiving',
      'isGenerating',
      'isLoading',
    ]) {
      expect(source).toContain(phase);
    }
    expect(source).not.toContain('useDecision');
    expect(source).not.toContain('decisionResource');
    expect(source).not.toContain('localStorage');
  }
  expect(sources[0]).toContain('useChat(');
  expect(sources[1]).toContain('chatResource(');
  expect(sources[1]).toContain('this.chat.error()');
  expect(sources[1]).toMatch(/if \(this\.chat\.error\(\)[^\n]*return '';/);
});
