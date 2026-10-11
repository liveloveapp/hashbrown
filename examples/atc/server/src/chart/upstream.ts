import { readZipEntries } from './zip';
import type { NasrFiles } from './nasr';

const NASR_BASE = 'https://nfdc.faa.gov/webContent/28DaySub/extra';

/** Downloads one NASR zip and unpacks it. Throws on a non-ok response. */
async function fetchZip(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Map<string, string>> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'hashbrown-atc-example (https://hashbrown.dev)' },
  });
  if (!response.ok) {
    throw new Error(`FAA NASR returned ${response.status} for ${url}`);
  }

  return readZipEntries(new Uint8Array(await response.arrayBuffer()));
}

/** Pulls one named file out of an unpacked zip. */
function entry(entries: Map<string, string>, name: string): string {
  const text = entries.get(name);
  if (text === undefined) {
    throw new Error(`NASR zip is missing ${name}`);
  }

  return text;
}

/**
 * Fetches the APT and FRQ CSV subscription zips for a NASR cycle date (such
 * as `01_Oct_2026`) in parallel and returns the four files the chart reads.
 * Throws on a non-ok response, a timeout, or a missing file.
 */
export async function fetchNasr(
  fetchFn: typeof fetch,
  nasrDate: string,
  timeoutMs: number,
): Promise<NasrFiles> {
  const [apt, frq] = await Promise.all([
    fetchZip(fetchFn, `${NASR_BASE}/${nasrDate}_APT_CSV.zip`, timeoutMs),
    fetchZip(fetchFn, `${NASR_BASE}/${nasrDate}_FRQ_CSV.zip`, timeoutMs),
  ]);

  return {
    aptBase: entry(apt, 'APT_BASE.csv'),
    aptRwy: entry(apt, 'APT_RWY.csv'),
    aptRwyEnd: entry(apt, 'APT_RWY_END.csv'),
    frq: entry(frq, 'FRQ.csv'),
  };
}
