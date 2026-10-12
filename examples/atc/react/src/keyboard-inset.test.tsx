import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { expect, test } from 'vitest';
import { useKeyboardInset } from './keyboard-inset';

function KeyboardInsetHost() {
  const ref = useRef<HTMLDivElement>(null);
  useKeyboardInset(ref);

  return <div ref={ref} />;
}

test("the keyboard inset publishes the keyboard's height as --atc-kb", () => {
  cleanup();
  const viewport = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
  });
  Object.defineProperty(window, 'visualViewport', {
    value: viewport,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: 800,
    configurable: true,
  });
  const { container } = render(<KeyboardInsetHost />);
  const div = container.querySelector('div') as HTMLElement;

  const before = div.style.getPropertyValue('--atc-kb');
  viewport.height = 500;
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });

  expect([before, div.style.getPropertyValue('--atc-kb')]).toEqual([
    '0px',
    '300px',
  ]);
});
