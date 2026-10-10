import { expect, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { applySnapshot, INITIAL_STATE } from '../store';
import {
  followPanOffset,
  markerClassName,
  planeIconHtml,
  planeTagText,
} from './airspace-map';

const plane: Aircraft = {
  hex: 'aaaaaa',
  callsign: 'UAL100',
  typeCode: 'B738',
  lat: 42,
  lon: -88,
  altitudeFt: 30000,
  onGround: false,
  groundSpeedKt: 450,
  trackDeg: 271.6,
  verticalRateFpm: 0,
};

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
  expect(html).toContain('data-callsign="UAL100"');
  expect(html).toContain('rotate(272deg)');
});

test('followPanOffset pans by whole pixels, only when at least 1 px off centre', () => {
  const centre = { x: 200, y: 150 };

  const offsets = [
    followPanOffset({ x: 200.4, y: 150.6 }, centre),
    followPanOffset({ x: 201.2, y: 150 }, centre),
    followPanOffset({ x: 190.6, y: 160.4 }, centre),
  ];

  expect(offsets).toEqual([null, { x: 1, y: 0 }, { x: -9, y: 10 }]);
});

test('planeTagText shows callsign and altitude with a thousands separator', () => {
  const texts = [
    planeTagText(plane),
    planeTagText({ ...plane, altitudeFt: 4200 }),
    planeTagText({ ...plane, altitudeFt: 0 }),
    planeTagText({ ...plane, altitudeFt: null }),
    planeTagText({ ...plane, altitudeFt: null, onGround: true }),
  ];

  expect(texts).toEqual([
    'UAL100 · 30,000',
    'UAL100 · 4,200',
    'UAL100 · 0',
    'UAL100 · —',
    'UAL100 · GND',
  ]);
});

test('planeIconHtml carries the tag outside the rotated silhouette', () => {
  const html = planeIconHtml(plane, 'atc-plane is-highlighted');

  expect(html).toContain(
    '<span class="atc-plane-tag">UAL100<span class="atc-plane-alt"> 30,000</span></span>',
  );
  expect(html.indexOf('rotate(272deg)')).toBeLessThan(html.indexOf('<svg'));
  expect(html).toMatch(
    /<div class="atc-plane-body" style="transform: rotate\(272deg\)">/,
  );
});
