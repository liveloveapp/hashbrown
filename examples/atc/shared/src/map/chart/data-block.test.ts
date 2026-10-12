// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ChartAirport } from '../../chart';
import { testChartAirport } from '../../testing';
import { dataBlockLines, renderDataBlock } from './data-block';

const runway05 = {
  id: '05/23',
  lengthFt: 7038,
  widthFt: 150,
  surface: 'ASPH',
  hard: true,
  ends: null,
  corners: null,
  bearingDeg: 60,
} as const;

const base = testChartAirport();

test('at zoom 9 and below only the ident shows', () => {
  const lines = dataBlockLines(base, 9);

  expect(lines).toEqual(['RDM']);
});

test('a towered field shows its tower frequency and elevation', () => {
  const lines = dataBlockLines(base, 11);

  expect(lines).toEqual(['ROBERTS FLD/REDMOND MUNI (RDM)', 'CT 124.5★ · 3082']);
});

test('a non-towered field shows its CTAF and elevation', () => {
  const bend: ChartAirport = {
    ...base,
    faa: 'BDN',
    name: 'BEND MUNI',
    towered: false,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
    elevationFt: 3459,
    runways: [{ ...runway05, id: '17/35', lengthFt: 5200 }],
  };

  const lines = dataBlockLines(bend, 11);

  expect(lines).toEqual(['BEND MUNI (BDN)', 'CTAF 123.0 · 3459']);
});

test('a field with neither frequency shows the elevation alone', () => {
  const bare: ChartAirport = {
    ...base,
    faa: 'X',
    name: 'X',
    towered: false,
    towerPartTime: false,
    frequencies: { tower: null, atis: null, ctaf: null, unicom: null },
    elevationFt: 3000,
  };

  const lines = dataBlockLines(bare, 10);

  expect(lines).toEqual(['X (X)', '3000']);
});

test('a towered field with no tower frequency falls back to CTAF', () => {
  const quiet: ChartAirport = {
    ...base,
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
  };

  const lines = dataBlockLines(quiet, 10);

  expect(lines[1]).toBe('CTAF 123.0 · 3082');
});

test('at zoom 14 and above only the name line shows', () => {
  const lines = dataBlockLines(base, 14);

  expect(lines).toEqual(['ROBERTS FLD/REDMOND MUNI (RDM)']);
});

test('at zoom 13 the data line still shows', () => {
  const lines = dataBlockLines(base, 13);

  expect(lines).toHaveLength(2);
});

test('the zoom 9 ident block is marked is-ident', () => {
  const lines = dataBlockLines(base, 9);

  const block = renderDataBlock(document, lines, 'ink', true);

  expect(block.querySelector('span')?.classList.contains('is-ident')).toBe(
    true,
  );
});

test('a one-line name block at zoom 14 is not is-ident', () => {
  const lines = dataBlockLines(base, 14);

  const block = renderDataBlock(document, lines, 'ink', false);

  expect(lines).toHaveLength(1);
  expect(block.querySelector('.is-ident')).toBeNull();
});

test('a two-line block is not marked is-ident', () => {
  const block = renderDataBlock(document, ['X (X)', '3000'], 'ink');

  expect(block.querySelector('.is-ident')).toBeNull();
});

test('rendered blocks use text nodes, so markup in names stays text', () => {
  const lines = ['<b>X</b> (ABC)'];

  const block = renderDataBlock(document, lines, 'ink');

  expect(block.classList.contains('is-ink')).toBe(true);
  expect(block.classList.contains('atc-apt-block')).toBe(true);
  expect(block.querySelector('b')).toBeNull();
  expect(block.textContent).toBe('<b>X</b> (ABC)');
});
