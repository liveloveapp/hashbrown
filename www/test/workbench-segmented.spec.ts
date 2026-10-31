// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchSegmented } from '../examples/quickstart/runtime/workbench-segmented';

const modes = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

test('renders one radio per mode with the selected one checked', () => {
  const control = createWorkbenchSegmented({
    label: 'View',
    onChange: vi.fn(),
  });

  control.sync(modes, 'b');

  const radios = [...control.element.querySelectorAll('[role=radio]')];
  expect(control.element.getAttribute('role')).toBe('radiogroup');
  expect(control.element.getAttribute('aria-label')).toBe('View');
  expect(radios.map((r) => r.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
  expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(radios.map((r) => (r as HTMLElement).tabIndex)).toEqual([-1, 0, -1]);
});

test('ArrowRight and Home move the choice and focus', () => {
  const onChange = vi.fn();
  const control = createWorkbenchSegmented({ label: 'View', onChange });
  document.body.append(control.element);
  control.sync(modes, 'a');
  const first = control.element.querySelector<HTMLElement>('[role=radio]');
  first?.focus();

  first?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  );
  control.sync(modes, 'b');
  const second = document.activeElement as HTMLElement;
  second.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
  );

  expect(onChange).toHaveBeenNthCalledWith(1, 'b');
  expect(onChange).toHaveBeenNthCalledWith(2, 'a');
  expect(second.textContent).toBe('Beta');
  control.element.remove();
});

test('re-syncing the same modes keeps focus on the same element', () => {
  const control = createWorkbenchSegmented({
    label: 'View',
    onChange: vi.fn(),
  });
  document.body.append(control.element);
  control.sync(modes, 'a');
  const second =
    control.element.querySelectorAll<HTMLElement>('[role=radio]')[1];
  second.focus();

  control.sync(modes, 'b');

  expect(document.activeElement).toBe(second);
  expect(second.getAttribute('aria-checked')).toBe('true');
  control.element.remove();
});
