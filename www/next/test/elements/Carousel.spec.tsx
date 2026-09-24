// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Carousel } from '../../src/components/elements/Carousel';

const slides = (
  <>
    <img src="/a.avif" alt="a" />
    <img src="/b.avif" alt="b" />
  </>
);

test('server-renders the slides and two disabled paging buttons', () => {
  const markup = <Carousel>{slides}</Carousel>;

  const html = renderToStaticMarkup(markup);

  expect(html).toContain('src="/a.avif"');
  expect(html).toMatch(
    /<button type="button" aria-label="Scroll left"[^>]*disabled/,
  );
  expect(html).toMatch(
    /<button type="button" aria-label="Scroll right"[^>]*disabled/,
  );
});

test('sets --columns from a valid columns attribute and ignores invalid ones', () => {
  const valid = <Carousel columns="1">{slides}</Carousel>;
  const invalid = <Carousel columns="zero">{slides}</Carousel>;

  const withColumns = renderToStaticMarkup(valid);
  const withoutColumns = renderToStaticMarkup(invalid);

  expect(withColumns).toContain('style="--columns:1"');
  expect(withoutColumns).not.toContain('--columns');
});

test('the paging buttons are keyboard-operable and page by the visible columns', async () => {
  cleanup();
  const { container, getByRole } = render(
    <Carousel columns="2">{slides}</Carousel>,
  );
  const scroller = container.querySelector('[data-scroller]') as HTMLDivElement;
  Object.defineProperties(scroller, {
    scrollWidth: { configurable: true, value: 1000 },
    clientWidth: { configurable: true, value: 400 },
  });
  scroller.style.columnGap = '16px';
  scroller.style.setProperty('--columns', '2');
  const first = scroller.firstElementChild as HTMLElement;
  first.getBoundingClientRect = () => ({ width: 180 }) as DOMRect;
  const scrollBy = vi.fn();
  scroller.scrollBy = scrollBy;
  await act(async () => {
    fireEvent.scroll(scroller);
  });
  const right = getByRole('button', { name: 'Scroll right' });
  const left = getByRole('button', { name: 'Scroll left' });

  right.focus();
  fireEvent.click(right);

  expect(document.activeElement).toBe(right);
  expect(right).not.toHaveProperty('disabled', true);
  expect(left).toHaveProperty('disabled', true);
  expect(scrollBy).toHaveBeenCalledWith({ left: 392, behavior: 'smooth' });
});
