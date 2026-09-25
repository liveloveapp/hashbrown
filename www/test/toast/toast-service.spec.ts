import { expect, test, vi } from 'vitest';
import {
  createToast,
  getToasts,
  toastService,
} from '../../src/components/toast/toast-service';

/** Clear toasts and timers left by a previous test. */
function reset() {
  vi.useRealTimers();
  toastService.dismissAll();
}

test('fills in the Angular ToastService defaults', () => {
  const id = 'toast-1';

  const toast = createToast(id, 'Hello');

  expect(toast).toEqual({
    id: 'toast-1',
    message: 'Hello',
    type: 'info',
    duration: 5000,
    position: 'top-right',
    dismissible: true,
    icon: undefined,
  });
});

test('keeps the options it is given', () => {
  const options = {
    type: 'error',
    duration: 0,
    position: 'bottom-left',
    dismissible: false,
    icon: '!',
  } as const;

  const toast = createToast('toast-2', 'Oops', options);

  expect(toast).toEqual({ id: 'toast-2', message: 'Oops', ...options });
});

test('show adds a toast and returns its id', () => {
  reset();

  const id = toastService.show('Saved');

  expect(getToasts()).toEqual([createToast(id, 'Saved')]);
});

test('the typed helpers set the toast type', () => {
  reset();

  toastService.success('a', { position: 'top-center' });
  toastService.error('b');
  toastService.warning('c');
  toastService.info('d');

  expect(getToasts().map((toast) => [toast.type, toast.position])).toEqual([
    ['success', 'top-center'],
    ['error', 'top-right'],
    ['warning', 'top-right'],
    ['info', 'top-right'],
  ]);
});

test('toasts dismiss themselves after their duration', () => {
  reset();
  vi.useFakeTimers();
  toastService.show('short', { duration: 1000 });
  toastService.show('default');

  vi.advanceTimersByTime(1000);
  const afterShort = getToasts().map((toast) => toast.message);
  vi.advanceTimersByTime(4000);
  const afterDefault = getToasts().map((toast) => toast.message);

  expect(afterShort).toEqual(['default']);
  expect(afterDefault).toEqual([]);
  vi.useRealTimers();
});

test('a zero duration keeps the toast up', () => {
  reset();
  vi.useFakeTimers();
  toastService.show('sticky', { duration: 0 });

  vi.advanceTimersByTime(60_000);

  expect(getToasts().map((toast) => toast.message)).toEqual(['sticky']);
  vi.useRealTimers();
});

test('dismiss removes only that toast, without mutating the old list', () => {
  reset();
  const first = toastService.show('first');
  toastService.show('second');
  const before = getToasts();

  toastService.dismiss(first);

  expect(getToasts().map((toast) => toast.message)).toEqual(['second']);
  expect(before).toHaveLength(2);
});

test('ids are unique', () => {
  reset();

  const ids = [toastService.show('a'), toastService.show('b')];

  expect(new Set(ids).size).toBe(2);
});
