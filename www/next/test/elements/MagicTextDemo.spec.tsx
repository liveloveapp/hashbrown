// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { MagicTextDemo } from '../../src/components/elements/MagicTextDemo';

test('server-renders the full Waffle House story and a slider at 100% without a network call', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  const html = renderToString(<MagicTextDemo />);

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(html).toContain('Stream progress');
  expect(html).toContain('100<!-- -->%');
  expect(html).toContain('type="range"');
  expect(html).toContain('aria-label="Stream percentage"');
  expect(html).toContain('href="https://www.wafflehouse.com"');
  expect(html).toContain('hb-magic-text-segment');
  fetchSpy.mockRestore();
});

test('moving the slider reveals only that share of the markdown', () => {
  cleanup();
  const { container, getByLabelText } = render(<MagicTextDemo />);

  fireEvent.change(getByLabelText('Stream percentage'), {
    target: { value: '10' },
  });

  expect(container.textContent).toContain('10%');
  expect(container.textContent).toContain('Hashbrowns');
  expect(container.textContent).not.toContain('sausage gravy');
});
