import { expect, test } from 'vitest';
import { AREAS } from '@atc/shared';
import { buildChartAirports } from './nasr';

const aptBase = [
  '"SITE_NO","SITE_TYPE_CODE","STATE_CODE","ARPT_ID","CITY","ARPT_NAME","OWNERSHIP_TYPE_CODE","FACILITY_USE_CODE","LAT_DECIMAL","LONG_DECIMAL","ELEV","ARPT_STATUS","FUEL_TYPES","LGT_SKED","TWR_TYPE_CODE","ICAO_ID"',
  '"19580.","A","OR","RDM","REDMOND","ROBERTS FLD/REDMOND MUNI","PU","PU",44.25406888,-121.14997138,3081.5,"O","100LL,A,MOGAS","SEE RMK","ATCT","KRDM"',
  '"19573.","A","OR","BDN","BEND","BEND MUNI","PU","PU",44.09456083,-121.20022111,3459.2,"O","100LL,A","SS-SR","NON-ATCT","KBDN"',
  '"19620.","A","OR","6K5","SISTERS","SISTERS EAGLE AIR","PU","PU",44.30458,-121.53925,3168,"O","","","NON-ATCT",""',
  '"99999.","A","OR","P01","NOWHERE","PRIVATE STRIP","PR","PR",44.1,-121.3,3000,"O","","","NON-ATCT",""',
  '"88888.","A","NY","JFK","NEW YORK","JOHN F KENNEDY INTL","PU","PU",40.64,-73.78,13,"O","A","SS-SR","ATCT","KJFK"',
  '"77777.","A","OR","bad!","X","BROKEN","PU","PU",44.2,-121.2,3000,"O","","","NON-ATCT",""',
].join('\n');
const aptRwy = [
  '"SITE_NO","ARPT_ID","RWY_ID","RWY_LEN","RWY_WIDTH","SURFACE_TYPE_CODE"',
  '"19580.","RDM","05/23",7038,150,"ASPH"',
  '"19580.","RDM","11/29",7006,100,"ASPH"',
  '"19580.","RDM","H1",48,48,"CONC"',
  '"19573.","BDN","17/35",5200,75,"ASPH"',
  '"19620.","6K5","02/20",3550,60,"ASPH"',
].join('\n');
const aptRwyEnd = [
  '"SITE_NO","ARPT_ID","RWY_ID","RWY_END_ID","LAT_DECIMAL","LONG_DECIMAL"',
  '"19580.","RDM","05/23","05",44.24950936,-121.16178461',
  '"19580.","RDM","05/23","23",44.25905422,-121.13844225',
  '"19573.","BDN","17/35","17",44.10172,-121.20186',
  '"19573.","BDN","17/35","35",44.08746,-121.19860',
].join('\n');
const frq = [
  '"FACILITY","FACILITY_TYPE","TOWER_HRS","SERVICED_FACILITY","SERVICED_SITE_TYPE","FREQ","FREQ_USE"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","119.025","ATIS"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","124.5","LCL/P"',
  '"RDM","ATCT","0600-2200","RDM","AIRPORT","256.8","LCL/P"',
  '"RDM","ATCT","","RDM","AIRPORT","122.95","UNICOM"',
  '"RDM","ATCT","","RDM","AIRPORT","124.5","CTAF"',
  '"BDN","NON-ATCT","","BDN","AIRPORT","123.0","CTAF"',
  '"BDN","ASOS_AWOS","","BDN","AWOS-3","134.425","BDN AWOS-3"',
].join('\n');

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
