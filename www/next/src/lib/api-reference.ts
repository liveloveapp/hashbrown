import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { repoRoot } from './repo-root';

/** The fields of an api-extractor member this spike renders. */
export interface ApiMember {
  kind: string;
  name: string;
  canonicalReference: string;
  formattedContent: string;
  docs: {
    summary: string;
    remarks: string;
    returns: string;
    examples: string[];
    deprecated: string;
  };
}

/** One documented symbol and its overloads/members. */
export interface ApiSymbol {
  name: string;
  kind: string;
  canonicalReference: string;
  isDeprecated: boolean;
  members: ApiMember[];
}

const referenceRoot = () => join(repoRoot(), 'www/analog/src/app/reference');

/** List every symbol that has a reference JSON file, as `{ pkg, symbol }`. */
export function listSymbols(): { pkg: string; symbol: string }[] {
  const root = referenceRoot();
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(join(root, dir.name))
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({
          pkg: dir.name,
          symbol: file.replace(/\.json$/, ''),
        })),
    );
}

/**
 * Read one symbol's reference JSON, or `undefined` if it doesn't exist or the
 * path points outside the reference directory.
 *
 * @param pkg - Package directory, e.g. `react`.
 * @param symbol - Symbol file name without `.json`, e.g. `useChat`.
 */
export function readSymbol(pkg: string, symbol: string): ApiSymbol | undefined {
  const root = referenceRoot();
  const file = resolve(root, pkg, `${symbol}.json`);
  if (!file.startsWith(root + sep) || !existsSync(file)) {
    return undefined;
  }
  return JSON.parse(readFileSync(file, 'utf-8')) as ApiSymbol;
}
