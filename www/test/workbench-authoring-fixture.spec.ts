import { expect, test } from 'vitest';
import { workbenchAuthoringFixtureText } from '../src/tools/workbench-authoring-fixture';

test('form fixture reads the actual applied context and preserves the edited step', () => {
  const input = [
    { role: 'user', content: 'Make the second step shorter.' },
    {
      type: 'function_call_output',
      output: JSON.stringify({
        revision: 1,
        plan: {
          title: 'Lighthouse',
          steps: ['Outline the demo', 'Record a longer demonstration.'],
        },
      }),
    },
  ];

  const value = JSON.parse(
    workbenchAuthoringFixtureText('natural-forms', input) as string,
  );

  expect(value).toEqual({
    title: 'Lighthouse',
    steps: ['Outline the demo', 'Record the demo.'],
  });
});

test('parser fixture provides JSON independently of tool context', () => {
  const first = JSON.parse(
    workbenchAuthoringFixtureText('json-parser', [
      { role: 'user', content: 'Name the plan Lighthouse.' },
    ]) as string,
  );
  const next = JSON.parse(
    workbenchAuthoringFixtureText('json-parser', [
      { role: 'user', content: 'Make the second step shorter.' },
    ]) as string,
  );

  expect(first.title).toBe('Lighthouse');
  expect(next.steps[0]).toBe(first.steps[0]);
  expect(next.steps[1].length).toBeLessThan(first.steps[1].length);
  expect(workbenchAuthoringFixtureText('tools', [])).toBeUndefined();
});
