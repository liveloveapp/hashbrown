import { expect, test } from 'vitest';
import { workbenchWorkflowFixtureText } from '../src/tools/workbench-workflow-fixture';

test('workflow fixture explains shared plan and preserves plain text response', () => {
  const messages = [{ role: 'user', content: 'Explain this two-step plan.' }];

  const text = workbenchWorkflowFixtureText('shared-state', messages);

  expect(text).toContain('Outline the trusted UI demo.');
  expect(text).toContain('Record the demo.');
  expect(text).not.toMatch(/[#*]|readContext/);
});

test('workflow fixture shortens the follow-up and leaves earlier lessons alone', () => {
  const messages = [{ role: 'user', content: 'Make the explanation shorter.' }];

  const text = workbenchWorkflowFixtureText('interrupts', messages);

  expect(text).toBe('Outline the trusted UI demo. Then record the demo.');
  expect(workbenchWorkflowFixtureText('tools', messages)).toBeUndefined();
});
