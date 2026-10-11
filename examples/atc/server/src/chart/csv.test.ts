import { expect, test } from 'vitest';
import { NasrFormatError, parseCsv, requireColumns } from './csv';

test('parses quoted fields with commas and doubled quotes', () => {
  const text = '"A","B"\r\n"1,5","say ""hi"""\r\n"2",\r\n';

  const rows = parseCsv(text);

  expect(rows).toEqual([
    { A: '1,5', B: 'say "hi"' },
    { A: '2', B: '' },
  ]);
});

test('requireColumns names the file and the missing columns', () => {
  const rows = parseCsv('"A"\n"1"\n');

  const check = () =>
    requireColumns(rows, 'APT_BASE.csv', ['A', 'TWR_TYPE_CODE']);

  expect(check).toThrow(NasrFormatError);
  expect(check).toThrow(/APT_BASE\.csv.*TWR_TYPE_CODE/);
});
