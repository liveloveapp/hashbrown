// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { KIND_PATHS } from '../kinds';
import { applySnapshot, INITIAL_STATE } from '../store';
import { testAircraft } from '../testing';
import type { Marker } from 'leaflet';
import {
  markerClassName,
  planeElementOf,
  planeIconHtml,
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

  expect(parts).toEqual(['AAAAAA', '30,000']);
});

test('the tag shows the altitude with a thousands separator and no leading space', () => {
  const tags = [
    renderedTag(plane),
    renderedTag({ ...plane, altitudeFt: 4200 }),
    renderedTag({ ...plane, altitudeFt: 0 }),
    renderedTag({ ...plane, altitudeFt: null }),
    renderedTag({ ...plane, altitudeFt: null, onGround: true }),
  ];

  // The altitude's CSS margin separates it from the label.
  expect(tags).toEqual([
    ['UAL100', '30,000'],
    ['UAL100', '4,200'],
    ['UAL100', '0'],
    ['UAL100', ''],
    ['UAL100', 'GND'],
  ]);
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
  expect(tagParts(host)).toEqual(['N352LL', '4,200']);
});

test('planeIconHtml carries the tag outside the rotated silhouette', () => {
  const html = planeIconHtml(plane, 'atc-plane is-highlighted');

  expect(html).toContain(
    '<span class="atc-plane-tag">UAL100<span class="atc-plane-alt">30,000</span></span>',
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
