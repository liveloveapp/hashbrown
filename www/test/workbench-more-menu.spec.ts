// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchMoreMenu } from '../examples/quickstart/runtime/workbench-more-menu';

function mountMenu(items: readonly string[] = ['JSON', 'Schema', 'Text']) {
  const onSelect = vi.fn();
  const menu = createWorkbenchMoreMenu({ idPrefix: 'test', onSelect });
  document.body.replaceChildren(menu.element);
  menu.sync(items);
  const trigger = menu.element.querySelector<HTMLButtonElement>(
    'button[aria-haspopup=menu]',
  ) as HTMLButtonElement;
  const items$ = () => [
    ...menu.element.querySelectorAll<HTMLElement>('[role=menuitem]'),
  ];
  return { menu, onSelect, trigger, items: items$ };
}

function press(target: EventTarget, key: string) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

test('choosing an item reports it and closes the menu', () => {
  const { onSelect, trigger, items } = mountMenu();
  trigger.click();

  items()[1].click();

  expect(onSelect).toHaveBeenCalledWith('Schema');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('[role=menu]')?.hasAttribute('hidden')).toBe(
    true,
  );
});

test('Escape closes the menu and focuses the More button', () => {
  const { trigger, items } = mountMenu();
  trigger.click();
  items()[0].focus();

  press(items()[0], 'Escape');

  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
});

test('ArrowDown and ArrowUp move between items', () => {
  const { trigger, items } = mountMenu();
  trigger.click();
  items()[0].focus();

  press(items()[0], 'ArrowDown');
  const afterDown = document.activeElement;
  press(items()[1], 'ArrowUp');

  expect(afterDown).toBe(items()[1]);
  expect(document.activeElement).toBe(items()[0]);
});

test('clicking outside closes the menu', () => {
  const { trigger } = mountMenu();
  trigger.click();

  document.body.click();

  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

test('an empty list hides the More button', () => {
  const { menu } = mountMenu([]);

  expect(menu.element.hidden).toBe(true);
});

test('a populated list shows the More button', () => {
  const { menu, trigger } = mountMenu(['JSON']);

  expect(menu.element.hidden).toBe(false);
  expect(trigger.textContent).toContain('More');
});
