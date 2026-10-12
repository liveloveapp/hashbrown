/** Parsed CSV records, plus the header row so empty files can be checked. */
export type CsvRows = Record<string, string>[] & {
  readonly columns: readonly string[];
};

/** Splits CSV text into rows of fields (quotes, commas and CRLF handled). */
function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      endRow();
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

/**
 * Parses CSV text into records keyed by the header row. Handles quoted fields
 * with commas and doubled quotes, CRLF line ends and blank lines.
 */
export function parseCsv(text: string): CsvRows {
  const [header = [], ...body] = splitRows(text);
  const records = body.map((fields) =>
    Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ''])),
  );

  // Non-enumerable, so the rows still compare equal to a plain array.
  return Object.defineProperty(records, 'columns', {
    value: header,
  }) as CsvRows;
}
