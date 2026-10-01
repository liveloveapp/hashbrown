import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AssistantShell } from './assistant-shell';

test('while the assistant loads, its starters are usable and a pick is held', () => {
  cleanup();
  const onStart = vi.fn();
  render(
    <AssistantShell starters={['Which clients pay late?']} onStart={onStart} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Connecting the assistant…',
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Which clients pay late?' }),
  );

  expect(onStart).toHaveBeenCalledWith('Which clients pay late?');
});

test('a held starter is named and the other starters wait', () => {
  cleanup();

  render(
    <AssistantShell
      starters={['Which clients pay late?']}
      pending="Which clients pay late?"
      onStart={vi.fn()}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    'Sending “Which clients pay late?” as soon as the assistant connects…',
  );
  expect(
    screen.getByRole('button', { name: 'Which clients pay late?' }),
  ).toBeDisabled();
});
