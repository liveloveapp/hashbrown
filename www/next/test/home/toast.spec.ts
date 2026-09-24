import { expect, test } from 'vitest';
import { addToast, removeToast } from '../../src/components/home/toast';

test('adds a toast without mutating the list', () => {
  const toasts = [{ id: 'a', message: 'first' }];

  const result = addToast(toasts, { id: 'b', message: 'second' });

  expect(result).toEqual([
    { id: 'a', message: 'first' },
    { id: 'b', message: 'second' },
  ]);
  expect(toasts).toHaveLength(1);
});

test('removes a toast by id', () => {
  const toasts = [
    { id: 'a', message: 'first' },
    { id: 'b', message: 'second' },
  ];

  const result = removeToast(toasts, 'a');

  expect(result).toEqual([{ id: 'b', message: 'second' }]);
});
