import { cleanup, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { loadAssistantWorkspace } from './assistant-chunk';

test('the assistant chunk resolves to its workspace when the import succeeds', async () => {
  function Workspace() {
    return null;
  }

  const chunk = await loadAssistantWorkspace(async () => ({
    AssistantWorkspace: Workspace,
  }));

  expect(chunk.default).toBe(Workspace);
});

test('a failed assistant chunk resolves to a notice instead of blanking the app', async () => {
  cleanup();
  const chunk = await loadAssistantWorkspace(async () => {
    throw new Error('Failed to fetch dynamically imported module');
  });
  const Unavailable = chunk.default;

  render(
    <Unavailable
      snapshot={{
        payments: [],
        invoices: [],
        customers: [],
        allocations: [],
        activities: [],
      }}
      onApplied={() => undefined}
    />,
  );

  expect(
    screen.getByText(
      "The assistant couldn't load. Reload the page to try again.",
    ),
  ).toHaveClass('connection-notice');
});
