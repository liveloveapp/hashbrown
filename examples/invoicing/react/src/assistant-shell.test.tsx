import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { AssistantShell } from './assistant-shell';

test('while the assistant loads, the rail says it is connecting', () => {
  cleanup();

  render(
    <AssistantShell starters={['Which clients pay late?']} onStart={vi.fn()} />,
  );

  expect(screen.getByRole('status')).toHaveTextContent(
    'Connecting the assistant…',
  );
});

test('picking a starter while the assistant loads hands it to onStart', () => {
  cleanup();
  const onStart = vi.fn();
  render(
    <AssistantShell starters={['Which clients pay late?']} onStart={onStart} />,
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'Which clients pay late?' }),
  );

  expect(onStart).toHaveBeenCalledWith('Which clients pay late?');
});

test('a held starter is named and the starters stay focusable but inert', () => {
  cleanup();
  const onStart = vi.fn();
  render(
    <AssistantShell
      starters={['Which clients pay late?', 'What needs matching?']}
      pending="Which clients pay late?"
      onStart={onStart}
    />,
  );
  const other = screen.getByRole('button', { name: 'What needs matching?' });

  fireEvent.click(other);

  expect(screen.getByRole('status')).toHaveTextContent(
    'Sending “Which clients pay late?” as soon as the assistant connects…',
  );
  expect(other).toHaveAttribute('aria-disabled', 'true');
  expect(other).toBeEnabled();
  expect(onStart).not.toHaveBeenCalled();
});
