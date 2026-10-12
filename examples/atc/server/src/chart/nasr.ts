import {
  bearingDeg,
  type ChartAirport,
  distanceNm,
  type FieldWeather,
  type Frequencies,
  FREQUENCY,
  ICAO,
  IDENT,
  type LatLon,
  type Lighting,
  longestHardRunwayFt,
  type Runway,
  runwayCorners,
  type RunwayEnd,
} from '@atc/shared';
import { type CsvRows, parseCsv } from './csv';

type Row = Record<string, string>;

/** The four NASR CSV files as text. */
export interface NasrFiles {
  readonly aptBase: string;
  readonly aptRwy: string;
  readonly aptRwyEnd: string;
  readonly frq: string;
}

const KINDS = { A: 'airport', H: 'heliport', C: 'seaplane' } as const;
const MILITARY = new Set(['MA', 'MN', 'MR', 'CG']);

/** Groups rows by the value of one column. */
function groupBy(rows: readonly Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[key] ?? '';
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }

  return groups;
}

function lighting(sked: string): Lighting {
  if (sked === '') return 'none';

  return sked === 'SS-SR' ? 'full' : 'limited';
}

/** A validated APT_BASE row, before runways and frequencies are joined. */
type AirportRow = Omit<
  ChartAirport,
  'runways' | 'frequencies' | 'weather' | 'towerPartTime' | 'rank'
> & {
  readonly siteNo: string;
};

/**
 * Turns one APT_BASE row into airport fields, or null when it is not a
 * public, open airport, heliport or seaplane base inside the radius.
 * Returns 'invalid' when the row is a candidate but fails validation.
 */
function airportRow(
  row: Row,
  centre: LatLon,
  radiusNm: number,
): AirportRow | null | 'invalid' {
  const kind = KINDS[(row['SITE_TYPE_CODE'] ?? '') as keyof typeof KINDS];
  if (row['FACILITY_USE_CODE'] !== 'PU' || row['ARPT_STATUS'] !== 'O' || !kind)
    return null;
  const lat = Number.parseFloat(row['LAT_DECIMAL'] ?? '');
  const lon = Number.parseFloat(row['LONG_DECIMAL'] ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'invalid';
  if (distanceNm(centre, { lat, lon }) > radiusNm) return null;
  const faa = row['ARPT_ID'] ?? '';
  const elevation = Number.parseFloat(row['ELEV'] ?? '');
  if (!IDENT.test(faa) || !Number.isFinite(elevation)) return 'invalid';
  const icao = row['ICAO_ID'] ?? '';

  return {
    siteNo: row['SITE_NO'] ?? '',
    code: ICAO.test(icao) ? icao : faa,
    faa,
    name: row['ARPT_NAME'] ?? '',
    city: row['CITY'] ?? '',
    state: row['STATE_CODE'] ?? '',
    aliases: [],
    lat,
    lon,
    elevationFt: Math.round(elevation),
    kind,
    towered: (row['TWR_TYPE_CODE'] ?? '').startsWith('ATCT'),
    lighting: lighting(row['LGT_SKED'] ?? ''),
    fuel: (row['FUEL_TYPES'] ?? '') !== '',
    military: MILITARY.has(row['OWNERSHIP_TYPE_CODE'] ?? ''),
  };
}

/** Builds the runways of one facility from its APT_RWY and APT_RWY_END rows. */
function runwaysFor(
  rwyRows: readonly Row[],
  endRows: readonly Row[],
  heliport: boolean,
): Runway[] {
  const runways: Runway[] = [];
  for (const row of rwyRows) {
    const id = row['RWY_ID'] ?? '';
    if (id.startsWith('H') && !heliport) continue;
    const lengthFt = Number.parseFloat(row['RWY_LEN'] ?? '');
    const widthFt = Number.parseFloat(row['RWY_WIDTH'] ?? '');
    if (!(lengthFt > 0) || !(widthFt > 0)) continue;
    const surface = row['SURFACE_TYPE_CODE'] || null;
    const ends = endRows
      .filter((e) => e['RWY_ID'] === id)
      .map((e) => ({
        id: e['RWY_END_ID'] ?? '',
        lat: Number.parseFloat(e['LAT_DECIMAL'] ?? ''),
        lon: Number.parseFloat(e['LONG_DECIMAL'] ?? ''),
      }))
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon));
    const pair =
      ends.length === 2 ? ([ends[0], ends[1]] as [RunwayEnd, RunwayEnd]) : null;
    runways.push({
      id,
      lengthFt,
      widthFt,
      surface,
      hard: /ASPH|CONC|PEM|BIT/.test(surface ?? ''),
      ends: pair,
      corners: pair ? runwayCorners(pair[0], pair[1], widthFt) : null,
      bearingDeg: pair ? bearingDeg(pair[0], pair[1]) : null,
    });
  }

  return runways;
}

/** Picks the tower, ATIS, CTAF and UNICOM frequencies and field weather. */
function frequenciesFor(rows: readonly Row[]): {
  frequencies: Frequencies;
  weather: FieldWeather | null;
  towerPartTime: boolean;
} {
  const valid = rows.filter((r) => FREQUENCY.test(r['FREQ'] ?? ''));
  const use = (r: Row) => r['FREQ_USE'] ?? '';
  const first = (pred: (r: Row) => boolean) =>
    valid.find(pred)?.['FREQ'] ?? null;
  const asos = valid.find((r) => r['FACILITY_TYPE'] === 'ASOS_AWOS');

  return {
    frequencies: {
      tower: first((r) => {
        const mhz = Number.parseFloat(r['FREQ'] ?? '');

        return use(r).startsWith('LCL') && mhz >= 118 && mhz <= 137;
      }),
      atis: first((r) => use(r) === 'ATIS' || use(r) === 'D-ATIS'),
      ctaf: first((r) => use(r) === 'CTAF'),
      unicom: first((r) => use(r) === 'UNICOM'),
    },
    weather: asos
      ? {
          kind: asos['SERVICED_SITE_TYPE'] ?? '',
          frequency: asos['FREQ'] ?? '',
        }
      : null,
    towerPartTime: valid.some(
      (r) =>
        r['FACILITY_TYPE'] === 'ATCT' &&
        (r['TOWER_HRS'] ?? '') !== '' &&
        r['TOWER_HRS'] !== '24',
    ),
  };
}

/** Thrown when a NASR file lacks columns the parser reads. */
export class NasrFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NasrFormatError';
  }
}

/**
 * Throws a `NasrFormatError` naming the file and every column in `columns`
 * that the header row lacks. An empty file counts as missing all of them.
 */
export function requireColumns(
  records: CsvRows,
  file: string,
  columns: readonly string[],
): void {
  const missing = columns.filter((c) => !records.columns.includes(c));
  if (missing.length > 0) {
    throw new NasrFormatError(
      `${file} is missing columns: ${missing.join(', ')}`,
    );
  }
}

function parseChecked(text: string, file: string, columns: string[]): CsvRows {
  const rows = parseCsv(text);
  requireColumns(rows, file, columns);

  return rows;
}

/**
 * Builds chart airports from the NASR APT_BASE, APT_RWY, APT_RWY_END and FRQ
 * CSV files: public-use, open airports, heliports and seaplane bases within
 * `radiusNm` of `centre`, ranked towered first, then by longest hard runway.
 * `dropped` counts candidate rows that failed validation.
 *
 * @throws NasrFormatError when a file lacks a column the parser reads.
 */
export function buildChartAirports(
  files: NasrFiles,
  centre: LatLon,
  radiusNm: number,
): { airports: ChartAirport[]; dropped: number } {
  const base = parseChecked(files.aptBase, 'APT_BASE.csv', [
    'SITE_NO',
    'SITE_TYPE_CODE',
    'STATE_CODE',
    'ARPT_ID',
    'CITY',
    'ARPT_NAME',
    'OWNERSHIP_TYPE_CODE',
    'FACILITY_USE_CODE',
    'LAT_DECIMAL',
    'LONG_DECIMAL',
    'ELEV',
    'ARPT_STATUS',
    'FUEL_TYPES',
    'LGT_SKED',
    'TWR_TYPE_CODE',
    'ICAO_ID',
  ]);
  const rwy = parseChecked(files.aptRwy, 'APT_RWY.csv', [
    'SITE_NO',
    'RWY_ID',
    'RWY_LEN',
    'RWY_WIDTH',
    'SURFACE_TYPE_CODE',
  ]);
  const ends = parseChecked(files.aptRwyEnd, 'APT_RWY_END.csv', [
    'SITE_NO',
    'RWY_ID',
    'RWY_END_ID',
    'LAT_DECIMAL',
    'LONG_DECIMAL',
  ]);
  const frq = parseChecked(files.frq, 'FRQ.csv', [
    'FACILITY_TYPE',
    'TOWER_HRS',
    'SERVICED_FACILITY',
    'SERVICED_SITE_TYPE',
    'FREQ',
    'FREQ_USE',
  ]);
  const rwyBySite = groupBy(rwy, 'SITE_NO');
  const endsBySite = groupBy(ends, 'SITE_NO');
  const frqByFacility = groupBy(frq, 'SERVICED_FACILITY');

  let dropped = 0;
  const built: ChartAirport[] = [];
  for (const row of base) {
    const parsed = airportRow(row, centre, radiusNm);
    if (parsed === null) continue;
    if (parsed === 'invalid') {
      dropped++;
      continue;
    }
    const { siteNo, ...fields } = parsed;
    const freq = frequenciesFor(frqByFacility.get(fields.faa) ?? []);
    built.push({
      ...fields,
      ...freq,
      runways: runwaysFor(
        rwyBySite.get(siteNo) ?? [],
        endsBySite.get(siteNo) ?? [],
        fields.kind === 'heliport',
      ),
      rank: 0,
    });
  }
  const airports = built
    .sort(
      (a, b) =>
        Number(b.towered) - Number(a.towered) ||
        longestHardRunwayFt(b) - longestHardRunwayFt(a) ||
        a.code.localeCompare(b.code),
    )
    .map((a, rank) => ({ ...a, rank }));

  return { airports, dropped };
}
