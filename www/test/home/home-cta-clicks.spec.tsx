// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { ClosingCta } from '../../src/components/home/ClosingCta';
import { HomeHero } from '../../src/components/home/HomeHero';
import { InstallCommand } from '../../src/components/home/InstallCommand';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));
vi.mock('next/link', () => ({
  default: ({ href, ...props }: { href: string; children?: ReactNode }) => (
    <a href={href} {...props} />
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.mocked(posthog.capture).mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

function mount(node: ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  // jsdom cannot navigate; stop link clicks after React has seen them.
  container.addEventListener('click', (event) => event.preventDefault());
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(node));
  return container;
}

function byText(container: HTMLElement, selector: string, text: string) {
  return [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => element.textContent?.trim() === text,
  )[0];
}

function ctaClicks() {
  return vi
    .mocked(posthog.capture)
    .mock.calls.filter(([event]) => event === 'marketing:cta_click')
    .map(([, props]) => props);
}

test('hero quick start tracks hero_quick_start on home', () => {
  const container = mount(<HomeHero codeHtml={{ react: '', angular: '' }} />);

  act(() => byText(container, 'a', 'Quick start →').click());

  expect(ctaClicks()).toEqual([
    {
      source_page: '/',
      cta_id: 'hero_quick_start',
      surface: 'home',
      destination_url: '/docs/angular/start/quick',
    },
  ]);
});

test('hero copy prompt tracks copy_prompt on home', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
  const container = mount(<HomeHero codeHtml={{ react: '', angular: '' }} />);

  await act(async () =>
    byText(container, 'button', 'Copy agent prompt').click(),
  );

  expect(ctaClicks()).toEqual([
    { source_page: '/', cta_id: 'copy_prompt', surface: 'home' },
  ]);
});

test('closing quick start and GitHub track their ids on home', () => {
  const container = mount(<ClosingCta />);

  act(() => byText(container, 'a', 'Quick start →').click());
  act(() => byText(container, 'a', 'Star on GitHub').click());

  expect(ctaClicks()).toEqual([
    {
      source_page: '/',
      cta_id: 'closing_quick_start',
      surface: 'home',
      destination_url: '/docs/angular/start/quick',
    },
    {
      source_page: '/',
      cta_id: 'closing_github',
      surface: 'home',
      destination_url: 'https://github.com/liveloveapp/hashbrown',
    },
  ]);
});

test('install copy and SDK switches track their ids on home', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
  const container = mount(<InstallCommand />);

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Copy install command"]')
      ?.click(),
  );
  act(() => byText(container, '[role="radio"]', 'React').click());
  act(() => byText(container, '[role="radio"]', 'React').click());
  act(() => byText(container, '[role="radio"]', 'Angular').click());

  expect(ctaClicks()).toEqual([
    { source_page: '/', cta_id: 'install_copy', surface: 'home' },
    { source_page: '/', cta_id: 'sdk_switch_react', surface: 'home' },
    { source_page: '/', cta_id: 'sdk_switch_angular', surface: 'home' },
  ]);
});
