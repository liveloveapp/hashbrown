// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, test } from 'vitest';
import { InstallCommand } from '../../src/components/home/InstallCommand';
import { SdkSwitch } from '../../src/components/home/SdkSwitch';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A mounted toggle; each test unmounts its own so no subscription outlives it. */
interface Mounted {
  container: HTMLElement;
  unmount: () => void;
}

function mount(): Mounted {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <>
        <InstallCommand />
        <SdkSwitch react={<p>react code</p>} angular={<p>angular code</p>} />
      </>,
    );
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

function radio(container: HTMLElement, label: string): HTMLButtonElement {
  return [
    ...container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ].filter((button) => button.textContent?.trim() === label)[0];
}

test('selecting React switches the code and stores the preference', () => {
  localStorage.clear();
  const { container, unmount } = mount();

  act(() => radio(container, 'React').click());

  expect(container.textContent).toContain('react code');
  expect(container.textContent).toContain('{core,react,openai}');
  expect(JSON.parse(localStorage.getItem('config') ?? '{}').sdk).toBe('react');
  unmount();
});

test('a stored preference picks the framework', () => {
  localStorage.setItem('config', JSON.stringify({ sdk: 'react' }));

  const { container, unmount } = mount();

  expect(container.textContent).toContain('react code');
  expect(radio(container, 'React').getAttribute('aria-checked')).toBe('true');
  unmount();
});

test('arrow keys select and focus the other framework', () => {
  localStorage.clear();
  const { container, unmount } = mount();

  act(() => {
    radio(container, 'Angular').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
  });

  expect(container.textContent).toContain('react code');
  expect(document.activeElement).toBe(radio(container, 'React'));
  unmount();
});
