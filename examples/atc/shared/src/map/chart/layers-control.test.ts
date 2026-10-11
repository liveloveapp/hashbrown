// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, onTestFinished, test } from 'vitest';
import { createAtcStore } from '../../store';
import { createLayersControl } from './layers-control';

const L = (module as unknown as { default?: typeof module }).default ?? module;

/** A map in the document with the Layers control added. */
function mount() {
  const store = createAtcStore();
  const element = document.createElement('div');
  document.body.append(element);
  const map = L.map(element).setView([44.25, -121.15], 10);
  const control = createLayersControl({ L, map, store });
  onTestFinished(() => {
    control.destroy();
    map.remove();
    element.remove();
  });
  const find = <T extends HTMLElement>(selector: string) => {
    const found = element.querySelector<T>(selector);
    if (found === null) throw new Error(`No ${selector}`);
    return found;
  };

  return {
    store,
    toggle: () => find<HTMLButtonElement>('button.atc-layers-toggle'),
    panel: () => find<HTMLElement>('.atc-layers-panel'),
    airports: () => find<HTMLInputElement>('input[name=airports]'),
  };
}

test('clicking Layers opens the panel', () => {
  const view = mount();

  view.toggle().click();

  expect(view.toggle().getAttribute('aria-expanded')).toBe('true');
  expect(view.panel().hidden).toBe(false);
  expect(view.panel().getAttribute('role')).toBe('group');
  expect(view.toggle().getAttribute('aria-controls')).toBe(view.panel().id);
});

test('unchecking Airports turns the airports layer off', () => {
  const view = mount();
  view.toggle().click();

  view.airports().click();

  expect(view.store.getState().layers.airports).toBe(false);
});

test('Escape closes the panel and focuses the toggle', () => {
  const view = mount();
  view.toggle().click();
  view.airports().focus();

  view
    .airports()
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

  expect(view.toggle().getAttribute('aria-expanded')).toBe('false');
  expect(view.panel().hidden).toBe(true);
  expect(document.activeElement).toBe(view.toggle());
});

test('a limited chart says so beside Airports', () => {
  const view = mount();

  view.store.setChartLimited();

  expect(view.airports().nextElementSibling?.textContent).toBe(
    'Airports · limited data',
  );
});

test('the checkbox follows the store and the cycle shows once known', () => {
  const view = mount();

  view.store.setLayers({ airports: false });
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports: [] });

  expect(view.airports().checked).toBe(false);
  expect(view.panel().textContent).toContain('FAA cycle 2610');
});
