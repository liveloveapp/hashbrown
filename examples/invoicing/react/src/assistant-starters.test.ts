import { expect, test } from 'vitest';
import { SELECTED_STARTER, STARTERS, startersFor } from './assistant-starters';

test('a selected payment leads, then a focused client, else the general starters', () => {
  const selections = [
    { selectedPaymentId: 'p', focusedClientName: 'Cedar Health' },
    { focusedClientName: 'Cedar Health' },
    {},
  ];

  const starters = selections.map(startersFor);

  expect(starters).toEqual([
    [SELECTED_STARTER, STARTERS[0], STARTERS[1]],
    [
      'What does Cedar Health owe, and how late is it?',
      STARTERS[0],
      STARTERS[1],
    ],
    STARTERS,
  ]);
});
