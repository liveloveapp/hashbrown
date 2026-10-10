import { expect, test } from 'vitest';
import { aircraftTypeName } from './names';

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
