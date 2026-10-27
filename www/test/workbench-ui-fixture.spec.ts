import { expect, test } from 'vitest';
import { getWorkbenchUiSystem } from '../examples/quickstart/runtime/workbench-ui-kits';
import {
  getWorkbenchUiFixtureLesson,
  workbenchUiFixtureText,
} from '../src/tools/workbench-ui-fixture';

test('fixture lesson identity comes from pinned system policy rather than user text', () => {
  expect(
    getWorkbenchUiFixtureLesson([
      { role: 'system', content: getWorkbenchUiSystem('ui-kits') },
    ]),
  ).toBe('ui-kits');
  expect(
    getWorkbenchUiFixtureLesson([
      { role: 'system', content: getWorkbenchUiSystem('ui-chatbot') },
    ]),
  ).toBe('ui-chatbot');
  expect(
    getWorkbenchUiFixtureLesson([
      { role: 'user', content: 'StepsCard PlanReading' },
    ]),
  ).toBeUndefined();
});

test('kit fixture changes presentation while preserving actual accepted context', () => {
  const context = {
    title: 'Accepted title',
    steps: ['Actual first step.', 'Record a longer demo.'],
  };
  const input = [
    { role: 'user', content: 'Show StepsCard with a shorter second step.' },
    {
      type: 'function_call_output',
      output: JSON.stringify({ revision: 1, plan: context }),
    },
  ];

  const value = JSON.parse(workbenchUiFixtureText('ui-kits', input) as string);

  expect(value.ui[0].StepsCard.props).toEqual({
    ...context,
    steps: ['Actual first step.', 'Record it.'],
  });
});

test('read-only fixture reports the latest actual application plan without manufacturing state', () => {
  const plan = { title: 'Reviewed title', steps: ['Edited first.', 'Second.'] };
  const input = [
    {
      type: 'function_call_output',
      output: JSON.stringify({
        revision: 0,
        plan: { title: 'Old', steps: [] },
      }),
    },
    { role: 'user', content: 'Read my accepted plan as PlanReading.' },
    {
      type: 'function_call_output',
      output: JSON.stringify({ revision: 1, plan }),
    },
  ];

  const value = JSON.parse(
    workbenchUiFixtureText('ui-chatbot', input) as string,
  );

  expect(value).toEqual({ ui: [{ PlanReading: { props: plan } }] });
  expect(workbenchUiFixtureText(undefined, input)).toBeUndefined();
});

test('new proposal uses one trusted component and a valid two-step draft', () => {
  const value = JSON.parse(
    workbenchUiFixtureText('ui-chatbot', [
      { role: 'user', content: 'Propose a plan.' },
    ]) as string,
  );

  expect(value.ui).toHaveLength(1);
  expect(value.ui[0].SummaryCard.props.steps).toHaveLength(2);
});
