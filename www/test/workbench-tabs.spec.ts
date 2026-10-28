// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createWorkbenchTabs } from '../examples/quickstart/runtime/workbench-tabs';

function mountTabs(replace = false) {
  const tablist = document.createElement('div');
  tablist.setAttribute('role', 'tablist');
  const panel = document.createElement('div');
  panel.id = 'test-panel';
  panel.setAttribute('role', 'tabpanel');
  document.body.append(tablist, panel);
  const tabs = createWorkbenchTabs(tablist, panel);
  const draw = (selected: number) => {
    if (replace || !tablist.children.length) {
      tablist.replaceChildren(
        ...[0, 1, 2].map((index) => {
          const button = document.createElement('button');
          button.id = `test-tab-${index}`;
          button.setAttribute('role', 'tab');
          button.textContent = `Tab ${index}`;
          button.onclick = () => draw(index);
          return button;
        }),
      );
    }
    tabs.sync(`test-tab-${selected}`);
  };
  draw(1);
  return { tablist, panel, tabs, draw };
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

test('restores keyboard focus to the activated tab when selection rebuilds tabs', () => {
  const { tablist, panel, tabs } = mountTabs(true);
  const original = tablist.children[1] as HTMLElement;
  original.focus();

  const event = press(original, 'ArrowRight');

  expect(original.isConnected).toBe(false);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(tablist.children[2]);
  expect(
    [...tablist.children].map((tab) => (tab as HTMLElement).tabIndex),
  ).toEqual([-1, -1, 0]);
  expect(panel.getAttribute('aria-labelledby')).toBe('test-tab-2');
  expect(tablist.getAttribute('aria-orientation')).toBe('horizontal');
  tabs.dispose();
  tablist.remove();
  panel.remove();
});

test('syncing selection never moves focus outside the tablist', () => {
  const { tablist, panel, tabs, draw } = mountTabs();
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();

  draw(2);

  expect(document.activeElement).toBe(input);
  expect(panel.tabIndex).toBe(0);
  expect(
    [...tablist.children].map((tab) => (tab as HTMLElement).tabIndex),
  ).toEqual([-1, -1, 0]);
  tabs.dispose();
  tablist.remove();
  panel.remove();
  input.remove();
});

test('ignores modifier keys, vertical arrows and events already handled locally', () => {
  const { tablist, panel, tabs } = mountTabs();
  const selected = tablist.children[1] as HTMLElement;
  selected.focus();

  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(press(selected, key, { [modifier]: true }).defaultPrevented).toBe(
        false,
      );
    }
    const handled = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    selected.dispatchEvent(handled);
  }
  expect(press(selected, 'ArrowUp').defaultPrevented).toBe(false);
  expect(press(selected, 'ArrowDown').defaultPrevented).toBe(false);

  expect(document.activeElement).toBe(selected);
  expect(selected.getAttribute('aria-selected')).toBe('true');
  tabs.dispose();
  expect(press(selected, 'ArrowRight').defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(selected);
  tablist.remove();
  panel.remove();
});
