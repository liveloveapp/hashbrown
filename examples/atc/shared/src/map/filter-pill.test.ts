// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { MapFilter } from '../find-aircraft';
import { applyMapFilter, INITIAL_STATE } from '../store';
import { createFilterPill } from './filter-pill';

function filterOf(overrides: Partial<MapFilter> = {}): MapFilter {
  return {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    inAirspace: null,
    ...overrides,
  };
}

test('the pill shows chips and calls onClear on the x', () => {
  let cleared = 0;
  const pill = createFilterPill(document, () => (cleared += 1));
  const state = applyMapFilter(
    INITIAL_STATE,
    filterOf({ kind: 'jet', approaching: 'KZZZ', maxAltitudeFt: 10000 }),
  );

  pill.sync(state, new Set(['maxAltitudeFt']));
  const chips = [...pill.element.querySelectorAll('.atc-filter-chip')];
  const button = pill.element.querySelector('button');
  button?.click();

  expect(pill.element.classList.contains('is-open')).toBe(true);
  expect(chips.map((chip) => chip.getAttribute('data-state'))).toEqual([
    'set',
    'streaming',
    'unknown',
  ]);
  expect(chips[1]?.textContent).toContain('pending');
  expect(chips[2]?.textContent).toContain('unknown place');
  expect(pill.element.getAttribute('role')).toBe('group');
  expect(pill.element.getAttribute('aria-label')).toBe('Map filter');
  expect(pill.element.hasAttribute('aria-live')).toBe(false);
  expect(button?.getAttribute('aria-label')).toBe('Clear filter');
  expect(cleared).toBe(1);
});

test('the pill is hidden when there is no filter and follows a cleared one', () => {
  const pill = createFilterPill(document, () => undefined);
  const set = applyMapFilter(INITIAL_STATE, filterOf({ kind: 'jet' }));

  pill.sync(set, new Set());
  const shown = pill.element.classList.contains('is-open');
  pill.sync(applyMapFilter(set, null), new Set());

  expect(shown).toBe(true);
  expect(pill.element.classList.contains('is-open')).toBe(false);
  expect(pill.element.querySelectorAll('.atc-filter-chip')).toHaveLength(0);
});

test('the pill builds text nodes only', () => {
  const pill = createFilterPill(document, () => undefined);
  const state = applyMapFilter(
    INITIAL_STATE,
    filterOf({ airline: '<img src=x onerror=alert(1)>' }),
  );

  pill.sync(state, new Set());

  expect(pill.element.querySelector('img')).toBeNull();
  expect(pill.element.textContent).toContain('<img src=x onerror=alert(1)>');
});

test('a notice opens the pill as text, beside any chips, until it is gone', () => {
  let cleared = 0;
  const pill = createFilterPill(document, () => (cleared += 1));
  const set = applyMapFilter(INITIAL_STATE, filterOf({ kind: 'jet' }));

  pill.sync(INITIAL_STATE, new Set(), "Couldn't filter. Try again.");
  const alone = pill.element.querySelector('.atc-filter-notice');
  const openAlone = pill.element.classList.contains('is-open');
  pill.element.querySelector('button')?.click();
  pill.sync(set, new Set(), "Couldn't filter. Try again.");
  const besideChips = pill.element.querySelectorAll('.atc-filter-chip').length;
  pill.sync(INITIAL_STATE, new Set(), null);

  expect(openAlone).toBe(true);
  expect(alone?.textContent).toBe("Couldn't filter. Try again.");
  expect(alone?.getAttribute('role')).toBe('status');
  expect(alone?.children).toHaveLength(0);
  expect(cleared).toBe(1);
  expect(besideChips).toBe(1);
  expect(pill.element.classList.contains('is-open')).toBe(false);
  expect(pill.element.querySelector('.atc-filter-notice')).toBeNull();
});
