import { expect, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { applySnapshot, INITIAL_STATE } from '../store';
import { markerClassName, planeIconHtml } from './airspace-map';

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
    'atc-plane',
  ]);
});

test('planeIconHtml rotates the plane to its track and tags it with its ID', () => {
  const html = planeIconHtml(plane, 'atc-plane');

  expect(html).toContain('data-hex="aaaaaa"');
  expect(html).toContain('data-callsign="UAL100"');
  expect(html).toContain('rotate(272deg)');
});
