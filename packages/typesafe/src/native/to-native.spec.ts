import type { Decision } from '@hashbrownai/core';
import { toNativeRequest } from './to-native';
import * as expected from './__fixtures__/request.json';

const request: Decision.Request = {
  state: 'Payouts have been failing for 3 days.',
  questions: {
    is_urgent: { type: 'yesNo', instructions: 'Does this convey urgency?' },
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      options: { billing: 'Payments and refunds', technical: null },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated is the customer?',
      levels: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    },
  },
};

test('yesNo maps to noul', () => {
  const native = toNativeRequest(request, 'jev-latest');

  expect(native.questions['is_urgent']).toEqual({
    type: 'noul',
    instructions: 'Does this convey urgency?',
  });
});

test('choice options map to criteria', () => {
  const native = toNativeRequest(request, 'jev-latest');

  expect(native.questions['department']).toEqual(expected.questions.department);
});

test('score levels map to an ordered criteria array', () => {
  const native = toNativeRequest(request, 'jev-latest');

  expect(native.questions['frustration']).toEqual(
    expected.questions.frustration,
  );
});

test('the whole request matches the recorded fixture', () => {
  const native = toNativeRequest(request, 'jev-latest');

  expect(native).toEqual(expected);
});

test('long context passes through without changing the body', () => {
  const longContext = { ...request, options: { longContext: true } };

  const native = toNativeRequest(longContext, 'jev-latest');

  expect(native).toEqual(expected);
});

test('structured state passes through', () => {
  const structured = { ...request, state: { ticket: { id: 1 } } };

  const native = toNativeRequest(structured, 'jev-latest');

  expect(native.state).toEqual({ ticket: { id: 1 } });
});
