import { expect, test } from 'vitest';
import { workbenchOnboardingFixtureText } from '../src/tools/workbench-onboarding-fixture';

test('first plan fixture renders only the exposed SummaryCard props', () => {
  const input = [{ role: 'user', content: 'Create a plan' }];

  const result = workbenchOnboardingFixtureText('first-plan', input);

  expect(JSON.parse(result ?? 'null')).toEqual({
    ui: [
      {
        SummaryCard: {
          props: {
            title: 'Show a trusted component',
            steps: ['Outline the trusted UI demo', 'Record the demo'],
          },
        },
      },
    ],
  });
});

test('plain conversation fixture uses actual retained user history', () => {
  const first = [{ role: 'user', content: 'Call my plan Lighthouse.' }];
  const followup = [
    ...first,
    { role: 'assistant', content: 'Outline Lighthouse.' },
    { role: 'user', content: 'What did I name my plan?' },
  ];

  const retained = workbenchOnboardingFixtureText('conversation', followup);
  const isolated = workbenchOnboardingFixtureText(
    'conversation',
    followup.slice(-1),
  );

  expect(retained).toContain('Lighthouse');
  expect(isolated).not.toContain('Lighthouse');
  expect(retained).not.toMatch(/[#*]|readContext/);
});

test('instructions fixture explains the fixed plan and leaves old fixtures alone', () => {
  const input = [{ role: 'user', content: 'What is the application plan?' }];

  const text = workbenchOnboardingFixtureText('system-instructions', input);

  expect(text).toContain('Outline the trusted UI demo');
  expect(text).not.toContain('garden');
  expect(workbenchOnboardingFixtureText('tools', input)).toBeUndefined();
});
