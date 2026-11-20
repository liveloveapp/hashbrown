// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import { createWorkbenchTabs } from '../examples/quickstart/runtime/workbench-tabs';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

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

/** Mounts the full workbench shell for a lesson, as the docs embed does. */
function mountForLesson(id: string) {
  const lesson = workbenchLessons.find((item) => item.id === id);
  if (!lesson) throw new Error(`unknown lesson ${id}`);
  const store = createWorkbenchStore();
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  mountWorkbench(
    host,
    store,
    {
      framework: 'React',
      lesson: {
        id: lesson.id,
        title: lesson.title,
        format: lesson.format,
        inspector: lesson.inspector,
      },
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    },
    { embed: 'live' },
  );
  return { host, store };
}

function tabNames(shell: { host: HTMLElement }) {
  return [...shell.host.querySelectorAll('.wb-tabs [role=tab]')].map(
    (tab) => tab.textContent,
  );
}

function selectedTab(shell: { host: HTMLElement }) {
  return shell.host.querySelector('.wb-tabs [aria-selected=true]')?.textContent;
}

function moreNames(shell: { host: HTMLElement }) {
  return [...shell.host.querySelectorAll('.wb-more [role=menuitem]')].map(
    (item) => item.textContent,
  );
}

function chooseMore(shell: { host: HTMLElement }, name: string) {
  const item = [
    ...shell.host.querySelectorAll<HTMLElement>('.wb-more [role=menuitem]'),
  ].find((node) => node.textContent === name);
  if (!item) throw new Error(`${name} is not in More`);
  item.click();
}

test('the bar holds the lead view, Requests and State, and More holds the rest', () => {
  const shell = mountForLesson('generative-ui');

  expect(tabNames(shell)).toEqual(['UI', 'Requests', 'State']);
  expect(moreNames(shell)).toEqual(['JSON']);
});

test('a tab chosen from More joins the bar and stays across renders', () => {
  const shell = mountForLesson('generative-ui');

  chooseMore(shell, 'JSON');
  shell.store.seek(0);

  expect(tabNames(shell)).toEqual(['UI', 'Requests', 'State', 'JSON']);
  expect(selectedTab(shell)).toBe('JSON');
  expect(moreNames(shell)).toEqual([]);
});

test('choosing another More tab replaces the promoted one', () => {
  const shell = mountForLesson('tools');

  chooseMore(shell, 'JSON');
  chooseMore(shell, 'UI');

  expect(tabNames(shell)).toEqual(['Requests', 'State', 'UI']);
  expect(selectedTab(shell)).toBe('UI');
  expect(moreNames(shell)).toEqual(['JSON']);
});

test('the default lesson tab opens first', () => {
  const shell = mountForLesson('request-transformation');

  expect(selectedTab(shell)).toBe('Transform');
});

test('a consumer-supplied tab list bypasses the rule and has no More menu', () => {
  const store = createWorkbenchStore();
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  mountWorkbench(
    host,
    store,
    { framework: 'React', send: vi.fn(), stop: vi.fn(), reset: vi.fn() },
    { inspectorTabs: ['JSON', 'UI', 'State'] },
  );

  const names = [...host.querySelectorAll('.wb-tabs [role=tab]')].map(
    (tab) => tab.textContent,
  );

  expect(names).toEqual(['JSON', 'UI', 'State']);
  expect(host.querySelector<HTMLElement>('.wb-more')?.hidden ?? true).toBe(
    true,
  );
});
