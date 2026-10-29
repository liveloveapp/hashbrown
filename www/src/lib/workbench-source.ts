/**
 * Header prefixes of docs code examples that come from the quickstart
 * workbench sources, resolved under `www/examples/quickstart/`.
 */
export const WORKBENCH_SNIPPET_ROOTS = [
  'react/',
  'angular/',
  'runtime/',
  'server/',
] as const;

const normalizeLines = (value: string): string[] => {
  const lines = value.split('\n').map((line) => line.trim());
  const first = lines.findIndex((line) => line !== '');
  if (first === -1) return [];
  let last = lines.length - 1;
  while (lines[last] === '') last--;
  return lines.slice(first, last + 1);
};

/**
 * Finds where a docs snippet sits in a source file. Lines are compared after
 * `trim()`, ignoring leading and trailing blank snippet lines, and the first
 * match wins.
 *
 * @param file - Full text of the source file.
 * @param snippet - Text of the docs snippet.
 * @returns The 1-based, inclusive line range, or `null` when not found.
 */
export function resolveSnippetLines(
  file: string,
  snippet: string,
): { start: number; end: number } | null {
  const needle = normalizeLines(snippet);
  if (needle.length === 0) return null;
  const lines = file.split('\n').map((line) => line.trim());
  for (let i = 0; i + needle.length <= lines.length; i++) {
    if (needle.every((line, offset) => lines[i + offset] === line)) {
      return { start: i + 1, end: i + needle.length };
    }
  }
  return null;
}
