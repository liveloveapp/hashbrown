// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { CopyButton } from '../src/components/CopyButton';
import { getToasts, toastService } from '../src/components/toast/toast-service';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

/** Undo the previous test: unmount, restore globals, clear toasts and DOM. */
function reset() {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastService.dismissAll();
  document.body.replaceChildren();
}

/** Render a code example with `code` as its content and a copy button. */
function mount(code: string) {
  const example = document.createElement('div');
  example.dataset.component = 'code-example';
  const content = document.createElement('div');
  content.dataset.content = '';
  content.textContent = code;
  const container = document.createElement('div');
  example.replaceChildren(container, content);
  document.body.replaceChildren(example);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<CopyButton />));
  return document.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy code to clipboard"]',
  );
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const mock = vi.fn(writeText);
  vi.stubGlobal('navigator', { clipboard: { writeText: mock } });
  return mock;
}

test('copies the code and shows a top-center success toast', async () => {
  reset();
  const writeText = stubClipboard(async () => undefined);
  const button = mount('const x = 1;');

  await act(async () => button?.click());

  expect(writeText).toHaveBeenCalledWith('const x = 1;');
  expect(
    getToasts().map(({ message, type, position }) => ({
      message,
      type,
      position,
    })),
  ).toEqual([
    {
      message: 'Code copied to clipboard',
      type: 'success',
      position: 'top-center',
    },
  ]);
});

test('logs a failed copy and shows no toast', async () => {
  reset();
  const error = new Error('denied');
  stubClipboard(async () => {
    throw error;
  });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
    // Silence the expected log.
  });
  const button = mount('const x = 1;');

  await act(async () => button?.click());

  expect(consoleError).toHaveBeenCalledWith('Copy failed', error);
  expect(getToasts()).toEqual([]);
});

test('does nothing when there is no code to copy', async () => {
  reset();
  const writeText = stubClipboard(async () => undefined);
  const button = mount('');

  await act(async () => button?.click());

  expect(writeText).not.toHaveBeenCalled();
  expect(getToasts()).toEqual([]);
});
