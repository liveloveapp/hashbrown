// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ToastContainer } from '../../src/components/toast/ToastContainer';
import { toastService } from '../../src/components/toast/toast-service';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

/** Undo the previous test: unmount, clear toasts and the DOM. */
function reset() {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.useRealTimers();
  toastService.dismissAll();
  document.body.replaceChildren();
}

function mount() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<ToastContainer />));
  return container;
}

const messagesIn = (position: string) =>
  Array.from(
    document.querySelectorAll(
      `[data-position="${position}"] [role="alert"] [data-message]`,
    ),
  ).map((element) => element.textContent);

test('renders nothing inside the outlet on the server', () => {
  reset();
  toastService.success('hidden on the server');

  const html = renderToString(<ToastContainer />);

  expect(html).not.toContain('hidden on the server');
});

test('groups toasts by position', () => {
  reset();
  mount();

  act(() => {
    toastService.success('copied', { position: 'top-center' });
    toastService.info('update');
    toastService.error('failed', { position: 'bottom-left' });
    toastService.warning('careful', { position: 'bottom-left' });
  });

  expect(messagesIn('top-center')).toEqual(['copied']);
  expect(messagesIn('top-right')).toEqual(['update']);
  expect(messagesIn('bottom-left')).toEqual(['failed', 'careful']);
  expect(document.querySelector('[data-position="top-left"]')).toBeNull();
});

test('marks the toast type and uses an assertive live region for errors', () => {
  reset();
  mount();

  act(() => {
    toastService.error('failed', { icon: '✕' });
  });

  const alert = document.querySelector('[role="alert"]');
  expect(alert?.getAttribute('data-type')).toBe('error');
  expect(alert?.getAttribute('aria-live')).toBe('assertive');
  expect(alert?.textContent).toContain('✕');
});

test('the close button dismisses the toast', () => {
  reset();
  mount();
  act(() => {
    toastService.success('copied');
  });

  act(() => {
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss notification"]',
      )
      ?.click();
  });

  expect(document.querySelector('[role="alert"]')).toBeNull();
});

test('toasts that are not dismissible have no close button', () => {
  reset();
  mount();

  act(() => {
    toastService.info('stays', { dismissible: false });
  });

  expect(
    document.querySelector('button[aria-label="Dismiss notification"]'),
  ).toBeNull();
});

test('toasts disappear after their duration', () => {
  reset();
  vi.useFakeTimers();
  mount();
  act(() => {
    toastService.success('copied');
  });

  act(() => vi.advanceTimersByTime(5000));

  expect(document.querySelector('[role="alert"]')).toBeNull();
  vi.useRealTimers();
});
