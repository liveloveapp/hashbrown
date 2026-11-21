// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { markWorkbenchFresh } from '../examples/quickstart/runtime/workbench-fresh-mark';

function card(steps: readonly string[]) {
  const article = document.createElement('article');
  article.className = 'wb-summary';
  const title = document.createElement('h2');
  const list = document.createElement('ol');
  steps.forEach((step) => {
    const item = document.createElement('li');
    item.textContent = step;
    list.append(item);
  });
  article.append(title, list);
  return article;
}

function feed() {
  const host = document.createElement('div');
  host.append(card(['a', 'b']), card(['c', 'd']));
  return host;
}

test('marks the step in the newest card only', () => {
  const host = feed();

  markWorkbenchFresh(host, { path: 'steps.1', text: 'd' });

  const marked = [...host.querySelectorAll('[data-wb-fresh]')];
  expect(marked).toHaveLength(1);
  expect(marked[0].textContent).toBe('d');
  expect(marked[0].getAttribute('data-wb-fresh')).toBe('');
});

test('settle writes the settle value', () => {
  const host = feed();

  markWorkbenchFresh(host, { path: 'title', text: 'x' }, { settle: true });

  expect(host.querySelector('[data-wb-fresh="settle"]')?.tagName).toBe('H2');
});

test('null clears every mark', () => {
  const host = feed();
  markWorkbenchFresh(host, { path: 'steps.0', text: 'c' });

  markWorkbenchFresh(host, null);

  expect(host.querySelectorAll('[data-wb-fresh]')).toHaveLength(0);
});

test('a path with no element marks nothing', () => {
  const host = feed();
  markWorkbenchFresh(host, { path: 'title', text: 'x' });

  markWorkbenchFresh(host, { path: 'steps.9', text: 'x' });

  expect(host.querySelectorAll('[data-wb-fresh]')).toHaveLength(0);
});

test('a streamed UI document path maps to the card field', () => {
  const host = feed();

  markWorkbenchFresh(host, {
    path: 'ui.0.SummaryCard.props.steps.1',
    text: 'd',
  });

  expect(host.querySelector('[data-wb-fresh]')?.textContent).toBe('d');
});

test('a card from before the newest user message is never marked', () => {
  const host = feed();
  const user = document.createElement('p');
  user.className = 'wb-user';
  host.append(user);

  markWorkbenchFresh(host, { path: 'steps.1', text: 'd' });

  expect(host.querySelectorAll('[data-wb-fresh]')).toHaveLength(0);
});

test('the newest turn card after the newest user message is marked', () => {
  const host = feed();
  const user = document.createElement('p');
  user.className = 'wb-user';
  host.append(user, card(['e', 'f']));

  markWorkbenchFresh(host, { path: 'steps.0', text: 'e' });

  expect(host.querySelector('[data-wb-fresh]')?.textContent).toBe('e');
});
