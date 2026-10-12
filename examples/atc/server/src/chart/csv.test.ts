import { expect, test } from 'vitest';
import { parseCsv } from './csv';

test('parses quoted fields with commas and doubled quotes', () => {
  const text = '"A","B"\r\n"1,5","say ""hi"""\r\n"2",\r\n';

  const rows = parseCsv(text);

  expect(rows).toEqual([
    { A: '1,5', B: 'say "hi"' },
    { A: '2', B: '' },
  ]);
});
