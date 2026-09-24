import { listSymbols, readSymbol } from './api-reference';
import { listDocs, readDoc, SDKS } from './content';

/** A column of a markdown table: which field to read and its header text. */
export interface MarkdownColumn<T extends object> {
  key: keyof T;
  header: string;
}

/** A docs page in the search sitemap. */
export interface SitemapEntry {
  url: string;
  title: string;
  description: string | undefined;
}

/** A documented symbol in the search index. */
export interface ApiReferenceEntry {
  url: string;
  symbol: string;
  kind: string;
  /** The npm package, e.g. `@hashbrownai/react`. */
  package: string;
}

/**
 * What the search overlay puts in its system prompt: the docs sitemap and the
 * API symbols, each as a markdown table.
 */
export interface SearchIndex {
  sitemap: string;
  apiReferences: string;
}

/**
 * Format a value for a markdown table cell: empty for `null`/`undefined`,
 * whitespace collapsed to single spaces, and pipes escaped.
 *
 * @param value - The cell's value.
 */
export function formatMarkdownCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

/**
 * Format rows as a compact markdown table (no padding), one row per entry.
 *
 * @param rows - The entries to list.
 * @param columns - Which fields to show, in order, and their headers.
 */
export function formatMarkdownTable<T extends object>(
  rows: readonly T[],
  columns: readonly MarkdownColumn<T>[],
): string {
  const header = `|${columns.map((column) => column.header).join('|')}|`;
  const separator = `|${columns.map(() => '---').join('|')}|`;
  const body = rows.map(
    (row) =>
      `|${columns.map((column) => formatMarkdownCell(row[column.key])).join('|')}|`,
  );
  return [header, separator, ...body].join('\n');
}

/** Every docs page of both SDKs with its frontmatter title and description. */
export function listSitemapEntries(): SitemapEntry[] {
  return SDKS.flatMap((sdk) =>
    listDocs(sdk).flatMap((slug) => {
      const doc = readDoc(sdk, slug);
      return doc
        ? [
            {
              url: `/docs/${sdk}/${slug.join('/')}`,
              title: doc.title,
              description: doc.description,
            },
          ]
        : [];
    }),
  ).sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Every symbol with a reference JSON file except namespaces, whose members
 * the model can't link to from this list.
 */
export function listApiReferenceEntries(): ApiReferenceEntry[] {
  return listSymbols()
    .flatMap(({ pkg, symbol }) => {
      const data = readSymbol(pkg, symbol);
      return data
        ? [
            {
              url: `/api/${pkg}/${symbol}`,
              symbol: data.name,
              kind: data.kind,
              package: data.canonicalReference?.split('!')[0] ?? '',
            },
          ]
        : [];
    })
    .filter((entry) => entry.kind !== 'Namespace')
    .sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Build the search index from the docs markdown and the API reference JSON.
 * Replaces the Angular overlay's `import.meta.glob` over the same files.
 */
export function buildSearchIndex(): SearchIndex {
  return {
    sitemap: formatMarkdownTable(listSitemapEntries(), [
      { key: 'url', header: 'url' },
      { key: 'title', header: 'title' },
      { key: 'description', header: 'description' },
    ]),
    apiReferences: formatMarkdownTable(listApiReferenceEntries(), [
      { key: 'url', header: 'url' },
      { key: 'symbol', header: 'symbol' },
      { key: 'kind', header: 'kind' },
      { key: 'package', header: 'package' },
    ]),
  };
}
