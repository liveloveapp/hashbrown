import { expect, test } from 'vitest';
import { aircraftTypeName, airlineFor, airlineName } from './names';

test('aircraftTypeName names general aviation and rotor types', () => {
  const codes = ['C172', 'r44', 'EC35', 'PA28', 'XXXX', null];

  const names = codes.map(aircraftTypeName);

  expect(names).toEqual([
    'Cessna 172',
    'Robinson R44',
    'Airbus H135',
    'Piper Cherokee',
    'XXXX',
    'Unknown type',
  ]);
});

test('names Pacific Northwest regional airlines and common light types', () => {
  const airlines = ['QXE2554', 'SKW3301', 'CPZ5810', 'AMF1883'].map(airlineFor);
  const types = ['S22T', 'AT72', 'DH8C', 'DA62', 'RV7', 'A139'].map(
    aircraftTypeName,
  );

  expect(airlines).toEqual([
    'Horizon Air',
    'SkyWest Airlines',
    'Compass Airlines',
    'Ameriflight',
  ]);
  expect(types).toEqual([
    'Cirrus SR22T',
    'ATR 72',
    'De Havilland Dash 8-300',
    'Diamond DA62',
    "Van's RV-7",
    'Leonardo AW139',
  ]);
});

test('names fall back to the raw code', () => {
  const labels = [
    airlineName('UAL1372'),
    airlineName('ZZZ123'),
    aircraftTypeName('B39M'),
    aircraftTypeName('ZZ99'),
    aircraftTypeName(null),
  ];

  expect(labels).toEqual([
    'United Airlines',
    'ZZZ',
    'Boeing 737 MAX 9',
    'ZZ99',
    'Unknown type',
  ]);
});
