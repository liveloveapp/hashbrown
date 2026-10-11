import { expect, test } from 'vitest';
import { AREAS } from '@atc/shared';
import { buildChartAirports } from './nasr';
import { aptBase, aptRwy, aptRwyEnd, frq } from './nasr-fixture';

const built = buildChartAirports(
  { aptBase, aptRwy, aptRwyEnd, frq },
  AREAS.pnw,
  AREAS.pnw.radiusNm,
);
const byCode = new Map(built.airports.map((a) => [a.code, a]));

test('keeps public-use airports in the area and drops the rest', () => {
  const codes = built.airports.map((a) => a.code).sort();

  expect(codes).toEqual(['6K5', 'KBDN', 'KRDM']);
  expect(built.dropped).toBe(1);
});

test('Redmond is towered part-time with CT, ATIS and UNICOM', () => {
  const rdm = byCode.get('KRDM');

  expect(rdm).toMatchObject({
    faa: 'RDM',
    towered: true,
    towerPartTime: true,
    lighting: 'limited',
    fuel: true,
    elevationFt: 3082,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
  });
});

test('Bend is non-towered with AWOS-3 and full lighting', () => {
  const bdn = byCode.get('KBDN');

  expect(bdn).toMatchObject({
    towered: false,
    towerPartTime: false,
    lighting: 'full',
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    frequencies: { tower: null, atis: null, ctaf: '123.0', unicom: null },
  });
});

test('an airport without an ICAO code uses its FAA ident as code', () => {
  const sisters = byCode.get('6K5');

  expect(sisters?.faa).toBe('6K5');
  expect(sisters?.runways[0]).toMatchObject({
    id: '02/20',
    ends: null,
    corners: null,
    bearingDeg: null,
  });
});

test('helipads are skipped at airports and runways get true-size corners', () => {
  const rdm = byCode.get('KRDM');

  expect(rdm?.runways.map((r) => r.id)).toEqual(['05/23', '11/29']);
  expect(rdm?.runways[0]?.corners).toHaveLength(4);
  expect(rdm?.runways[0]?.bearingDeg).toBeCloseTo(60, 0);
  expect(rdm?.runways[1]?.corners).toBeNull();
});

test('towered airports rank first, then by longest hard runway', () => {
  const order = [...built.airports]
    .sort((a, b) => a.rank - b.rank)
    .map((a) => a.code);

  expect(order).toEqual(['KRDM', 'KBDN', '6K5']);
});

test('a missing column is a format error, not a silent empty result', () => {
  const broken = aptBase.replace('"TWR_TYPE_CODE",', '');

  const run = () =>
    buildChartAirports(
      { aptBase: broken, aptRwy, aptRwyEnd, frq },
      AREAS.pnw,
      250,
    );

  expect(run).toThrow(/TWR_TYPE_CODE/);
});
