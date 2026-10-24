import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStructuredChat } from '@hashbrownai/react';
import { expect, test, vi } from 'vitest';
import { LocalModels } from '../../examples/quickstart/react/src/LocalModels';

vi.mock('@hashbrownai/react', () => ({ useStructuredChat: vi.fn() }));

test('local models start without preparing or generating and require explicit preparation', () => {
  const setMessages = vi.fn();
  vi.mocked(useStructuredChat).mockReturnValue({
    messages: [],
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isLoading: false,
    setMessages,
  } as unknown as ReturnType<typeof useStructuredChat>);

  const html = renderToStaticMarkup(<LocalModels />);

  expect(html).toContain('Three days in Lisbon.');
  expect(html).toContain('Prepare model');
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*>Generate locally<\/button>/,
  );
  expect(html).toContain('Prepare the model to begin.');
  expect(html).toContain('aria-label="Trip brief"');
  expect(html).not.toContain('<dl>');
  expect(setMessages).not.toHaveBeenCalled();
});

test('both local clients use the real guarded Chrome transport, fresh messages and safe result gating', () => {
  const sources = [
    readFileSync(
      new URL(
        '../../examples/quickstart/react/src/LocalModels.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFileSync(
      new URL(
        '../../examples/quickstart/angular/src/app/local-models.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ];

  for (const source of sources) {
    expect(source).toContain('experimental_chrome(');
    expect(source).toContain("outputLanguage: 'en'");
    expect(source).toContain('downloadRequired:');
    expect(source).toContain('Prepare model');
    expect(source).toContain('getReadyTripBrief(');
    expect(source).toContain('prepareLocalModel(');
    expect(source).toContain('.setMessages([');
    expect(source).toContain('crypto.randomUUID()');
    for (const phase of [
      'isSending',
      'isReceiving',
      'isGenerating',
      'isLoading',
    ])
      expect(source).toContain(phase);
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('fetch(');
  }
  expect(sources[0]).toContain('useStructuredChat(');
  expect(sources[1]).toContain('structuredChatResource(');
  expect(sources[1]).toContain('this.chat.error() ? [] : this.chat.value()');
});
