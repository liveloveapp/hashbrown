// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../aircraft';
import { KIND_PATHS } from '../kinds';
import { applyMapFilter, applySnapshot, INITIAL_STATE } from '../store';
import type { MapFilter } from '../find-aircraft';
import { testAircraft } from '../testing';
import type { Marker } from 'leaflet';
import {
  altText,
  filteredOutHexes,
  markerClassName,
  planeElementOf,
  planeIconHtml,
  restartPulse,
  updatePlane,
} from './plane-marker';

const plane = testAircraft({
  lat: 42,
  lon: -88,
  altitudeFt: 30000,
  groundSpeedKt: 450,
  trackDeg: 271.6,
});

/** The rendered tag's label and altitude span. */
function tagParts(host: ParentNode): [string, string] {
  const tag = host.querySelector('.atc-plane-tag');

  return [
    tag?.firstChild?.textContent ?? '',
    tag?.querySelector('.atc-plane-alt')?.textContent ?? '',
  ];
}

/** Renders a marker and reads its tag's label and altitude span. */
function renderedTag(aircraft: Aircraft): [string, string] {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(aircraft, 'atc-plane');

  return tagParts(host);
}

test('markerClassName reflects selection, follow and highlight', () => {
  const base = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });
  const highlightedOther = { ...base, highlighted: new Set(['bbbbbb']) };

  const classes = [
    markerClassName(base, 'aaaaaa'),
    markerClassName(
      { ...base, selectedHex: 'aaaaaa', followingHex: 'aaaaaa' },
      'aaaaaa',
    ),
    markerClassName(highlightedOther, 'aaaaaa'),
    markerClassName(highlightedOther, 'bbbbbb'),
  ];

  expect(classes).toEqual([
    'atc-plane',
    'atc-plane is-selected is-followed',
    'atc-plane is-dimmed',
    'atc-plane is-highlighted',
  ]);
});

test('planeIconHtml rotates the plane to its track and tags it with its ID', () => {
  const html = planeIconHtml(plane, 'atc-plane');

  expect(html).toContain('data-hex="aaaaaa"');
  expect(html).toContain('data-label="UAL100"');
  expect(html).toContain('rotate(271.6deg)');
});

test('the tag shows a hex-only aircraft by its label', () => {
  const unidentified = { ...plane, label: 'AAAAAA', callsign: null };

  const parts = renderedTag(unidentified);

  expect(parts).toEqual(['AAAAAA', ' 30,000']);
});

test('the tag shows the altitude with a thousands separator after a space', () => {
  const tags = [
    renderedTag(plane),
    renderedTag({ ...plane, altitudeFt: 4200 }),
    renderedTag({ ...plane, altitudeFt: 0 }),
    renderedTag({ ...plane, altitudeFt: null }),
    renderedTag({ ...plane, altitudeFt: null, onGround: true }),
  ];

  expect(tags).toEqual([
    ['UAL100', ' 30,000'],
    ['UAL100', ' 4,200'],
    ['UAL100', ' 0'],
    ['UAL100', ''],
    ['UAL100', ' GND'],
  ]);
});

test('a screen reader hears the label and the altitude as two words', () => {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(plane, 'atc-plane');

  const text = host.querySelector('.atc-plane-tag')?.textContent;

  expect(text).toBe('UAL100 30,000');
});

test('planeIconHtml leaves out the marker title and an unknown altitude', () => {
  const html = planeIconHtml({ ...plane, altitudeFt: null }, 'atc-plane');

  expect(html).toContain(
    '<span class="atc-plane-tag">UAL100<span class="atc-plane-alt"></span></span>',
  );
});

test('updatePlane keeps label, data-label and tag current, writing only changes', () => {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(plane, 'atc-plane');
  const tagNode = host.querySelector('.atc-plane-tag') as HTMLElement;
  const writes: string[] = [];
  new MutationObserver((records) =>
    records.forEach((r) => writes.push(r.type)),
  ).observe(tagNode, { childList: true, subtree: true, characterData: true });

  updatePlane(host, plane, 'atc-plane');
  updatePlane(
    host,
    { ...plane, label: 'N352LL', callsign: null, altitudeFt: 4200 },
    'atc-plane',
  );

  expect(host.querySelector('.atc-plane')?.getAttribute('data-label')).toBe(
    'N352LL',
  );
  expect(tagParts(host)).toEqual(['N352LL', ' 4,200']);
});

test('planeIconHtml carries the tag outside the rotated silhouette', () => {
  const html = planeIconHtml(plane, 'atc-plane is-highlighted');

  expect(html).toContain(
    '<span class="atc-plane-tag">UAL100<span class="atc-plane-alt"> 30,000</span></span>',
  );
  expect(html.indexOf('rotate(271.6deg)')).toBeLessThan(html.indexOf('<svg'));
  expect(html).toMatch(
    /<div class="atc-plane-body" data-kind="jet" style="transform: rotate\(271.6deg\)">/,
  );
});

test('planeIconHtml draws the silhouette for the aircraft kind', () => {
  const kinds = ['jet', 'twin', 'single', 'rotor'] as const;

  const html = kinds.map((kind) =>
    planeIconHtml({ ...plane, kind }, 'atc-plane'),
  );

  kinds.forEach((kind, i) => {
    expect(html[i]).toContain(`data-kind="${kind}"`);
    expect(html[i]).toContain(`<path d="${KIND_PATHS[kind]}"/>`);
  });
  expect(new Set(html.map((h) => h.match(/<path d="[^"]+"/)?.[0])).size).toBe(
    4,
  );
});

test('updatePlane swaps the silhouette when the kind changes, leaving the marker in place', () => {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(plane, 'atc-plane');
  const markerNode = host.querySelector('.atc-plane');
  const body = host.querySelector('.atc-plane-body') as HTMLElement;
  const svgBefore = body.querySelector('svg');

  updatePlane(host, plane, 'atc-plane');
  const svgSame = body.querySelector('svg');
  updatePlane(host, { ...plane, kind: 'rotor' }, 'atc-plane');

  expect(svgSame).toBe(svgBefore);
  expect(host.querySelector('.atc-plane')).toBe(markerNode);
  expect(host.querySelector('.atc-plane-body')).toBe(body);
  expect(body.getAttribute('data-kind')).toBe('rotor');
  expect(body.querySelector('path')?.getAttribute('d')).toBe(KIND_PATHS.rotor);
  expect(body.style.transform).toBe('rotate(271.6deg)');
});

test('planeElementOf finds the plane element of a drawn marker, else null', () => {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(plane, 'atc-plane');
  const markers = new Map([
    ['aaaaaa', { getElement: () => host } as unknown as Marker],
    ['bbbbbb', { getElement: () => undefined } as unknown as Marker],
  ]);

  const found = ['aaaaaa', 'bbbbbb', 'cccccc'].map((hex) =>
    planeElementOf(markers, hex),
  );

  expect(found).toEqual([host.querySelector('.atc-plane'), null, null]);
});

test('altText matches the tag: feet with a comma, GND on the ground, empty when unknown', () => {
  const texts = [
    altText({ ...plane, altitudeFt: 4500 }),
    altText({ ...plane, onGround: true }),
    altText({ ...plane, altitudeFt: null }),
  ];

  expect(texts).toEqual(['4,500', 'GND', '']);
});

test('restartPulse removes and re-adds is-pulsing, and ignores a plane not drawn', () => {
  const plane = document.createElement('div');
  plane.classList.add('atc-plane', 'is-pulsing');
  const remove = vi.spyOn(plane.classList, 'remove');

  restartPulse(plane);
  restartPulse(null);

  expect(remove).toHaveBeenCalledWith('is-pulsing');
  expect(plane.classList.contains('is-pulsing')).toBe(true);
});

/** A filter with every field "any", overridden by `overrides`. */
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

const jet = testAircraft({ hex: 'aaaaaa', kind: 'jet' });
const single = testAircraft({ hex: 'bbbbbb', kind: 'single' });
const rotor = testAircraft({ hex: 'cccccc', kind: 'rotor' });

test('planes outside the filter are filtered out except selected, highlighted and followed planes', () => {
  const planes = ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee'].map(
    (hex, index) =>
      testAircraft({
        hex,
        label: `SGL${index}`,
        kind: index === 0 ? 'jet' : 'single',
      }),
  );
  const snapshot = applySnapshot(INITIAL_STATE, { at: 1, aircraft: planes });
  const state = {
    ...applyMapFilter(snapshot, filterOf({ kind: 'jet' })),
    selectedHex: 'bbbbbb',
    followingHex: 'cccccc',
    highlighted: new Set(['dddddd']),
  };

  const outside = filteredOutHexes(state);

  expect([...outside]).toEqual(['eeeeee']);
  expect(markerClassName(state, 'eeeeee', outside)).toContain(
    'is-filtered-out',
  );
  for (const hex of ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd']) {
    expect(markerClassName(state, hex, outside)).not.toContain(
      'is-filtered-out',
    );
  }
});

test('a plane that starts matching after a new snapshot loses is-filtered-out', () => {
  const first = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [single] });
  const filtered = applyMapFilter(first, filterOf({ kind: 'jet' }));
  const before = markerClassName(
    filtered,
    'bbbbbb',
    filteredOutHexes(filtered),
  );

  const next = applySnapshot(filtered, {
    at: 2,
    aircraft: [{ ...single, kind: 'jet' }],
  });
  const after = markerClassName(next, 'bbbbbb', filteredOutHexes(next));

  expect(before).toContain('is-filtered-out');
  expect(after).not.toContain('is-filtered-out');
});

test('a filter that matches nothing filters out every plane except pointed-at ones', () => {
  const snapshot = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [jet, single, rotor],
  });
  const state = {
    ...applyMapFilter(snapshot, filterOf({ airline: 'zzzznomatch' })),
    selectedHex: 'aaaaaa',
  };

  const outside = filteredOutHexes(state);

  expect([...outside].sort()).toEqual(['bbbbbb', 'cccccc']);
});

test('without a filter no plane is filtered out', () => {
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [jet] });

  expect(filteredOutHexes(state).size).toBe(0);
});

test('updatePlane toggles is-filtered-out in place', () => {
  const host = document.createElement('div');
  host.innerHTML = planeIconHtml(jet, 'atc-plane');
  const element = host.firstElementChild as HTMLElement;

  updatePlane(host, jet, 'atc-plane is-filtered-out');
  const on = host
    .querySelector('.atc-plane')
    ?.classList.contains('is-filtered-out');
  updatePlane(host, jet, 'atc-plane');
  const off = host
    .querySelector('.atc-plane')
    ?.classList.contains('is-filtered-out');

  expect(element).toBeTruthy();
  expect([on, off]).toEqual([true, false]);
});
