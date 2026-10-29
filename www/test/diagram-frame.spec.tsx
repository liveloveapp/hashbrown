// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DiagramFrame } from '../src/components/diagrams/DiagramFrame';

test('Tab wraps from the text alternative to Close and Shift+Tab returns to the alternative', () => {
  cleanup();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  // jsdom has no top-layer dialog implementation. Native modality is also
  // checked in a browser; this test exercises the frame's keyboard handler.
  const original = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  try {
    const { container, getByRole } = render(
      <DiagramFrame
        id="keyboard"
        title="A diagram"
        caption="A caption"
        description="A complete description"
      >
        <svg role="img" aria-label="A diagram" />
      </DiagramFrame>,
    );
    fireEvent.click(getByRole('button', { name: 'Expand diagram' }));
    const dialog = getByRole('dialog');
    const summary = dialog.querySelector('summary');
    const close = dialog.querySelector('button');
    summary?.focus();
    fireEvent.keyDown(summary ?? dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close ?? dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(summary);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  } finally {
    HTMLDialogElement.prototype.showModal = original;
    cleanup();
  }
});
