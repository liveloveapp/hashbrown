// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  scrollEdges,
  ScrollTable,
} from '../../src/components/elements/ScrollTable';

const rows = (
  <tbody>
    <tr>
      <td>cell</td>
    </tr>
  </tbody>
);

test('a table that fits has no overflow on either edge', () => {
  const metrics = { scrollLeft: 0, scrollWidth: 700, clientWidth: 700 };

  const edges = scrollEdges(metrics);

  expect(edges).toEqual({ start: false, end: false });
});

test('a wide table at rest has more to see at the end only', () => {
  const metrics = { scrollLeft: 0, scrollWidth: 900, clientWidth: 700 };

  const edges = scrollEdges(metrics);

  expect(edges).toEqual({ start: false, end: true });
});

test('a wide table scrolled to the end, within a pixel, has more at the start only', () => {
  const metrics = { scrollLeft: 199.5, scrollWidth: 900, clientWidth: 700 };

  const edges = scrollEdges(metrics);

  expect(edges).toEqual({ start: true, end: false });
});

test('server-renders the table inside a scroller with no edge shadows', () => {
  const markup = <ScrollTable>{rows}</ScrollTable>;

  const html = renderToStaticMarkup(markup);

  expect(html).toMatch(/<div[^>]*data-scroll-table=""[^>]*><div[^>]*><table>/);
  expect(html).not.toContain('data-overflow-start');
  expect(html).not.toContain('data-overflow-end');
});

test('marks the edges that have more to scroll as the user scrolls', async () => {
  cleanup();
  const { container } = render(<ScrollTable>{rows}</ScrollTable>);
  const frame = container.querySelector('[data-scroll-table]') as HTMLElement;
  const scroller = frame.firstElementChild as HTMLElement;
  Object.defineProperty(scroller, 'scrollWidth', { value: 900 });
  Object.defineProperty(scroller, 'clientWidth', { value: 700 });

  await act(async () => {
    scroller.scrollLeft = 100;
    fireEvent.scroll(scroller);
  });

  expect(frame.hasAttribute('data-overflow-start')).toBe(true);
  expect(frame.hasAttribute('data-overflow-end')).toBe(true);
});

test('re-measures when the table itself resizes, such as after fonts load', async () => {
  cleanup();
  const observed: Element[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(target: Element) {
        observed.push(target);
      }
      disconnect() {
        return undefined;
      }
    },
  );

  const { container } = render(<ScrollTable>{rows}</ScrollTable>);

  expect(observed).toContain(container.querySelector('table'));
  vi.unstubAllGlobals();
});
