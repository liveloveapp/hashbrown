import { render, screen } from '@testing-library/react';
import { RichMessage } from './RichMessage';

test('wraps long error messages inside a shrinkable text container', () => {
  const message = {
    role: 'error' as const,
    content: `Request failed: ${'x'.repeat(200)}`,
  };

  render(
    <RichMessage message={message} onRetry={() => undefined} isLast={true} />,
  );

  const errorText = screen.getByText(message.content);

  expect(errorText.className).toContain('min-w-0');
  expect(errorText.className).toContain('break-words');
  expect(errorText.className).toContain('whitespace-pre-wrap');
});
