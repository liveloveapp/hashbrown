/** A parsed api-extractor canonical reference, e.g. `@hashbrownai/react!useChat:function`. */
export interface CanonicalReference {
  package: string;
  name: string;
  kind: string;
  isPrivate: boolean;
}

/**
 * Matches a canonical reference in prose. Same shape as the Analog marked
 * extension's pattern, plus `~` so private symbols render as their name.
 */
export const CANONICAL_REFERENCE_PATTERN = /@?[\w/-]+![~\w]+:[\w]+/g;

/**
 * Parse a canonical reference. Returns `undefined` for malformed input.
 *
 * @param reference - e.g. `@hashbrownai/react!useChat:function`.
 */
export function parseCanonicalReference(
  reference: string,
): CanonicalReference | undefined {
  const [packagePart, rest] = reference.split('!');
  const [name, kindPart] = rest?.split(':') ?? [];
  if (!name || !kindPart) {
    return undefined;
  }
  const pkg = packagePart === '' ? '@@internal' : packagePart;
  return {
    package: pkg,
    name,
    kind: kindPart.split('(')[0],
    isPrivate: name.startsWith('~') || pkg === '@@internal',
  };
}

/**
 * Where a symbol link should point: the site's API reference for Hashbrown
 * packages, angular.dev for Angular, nowhere for private or unknown symbols.
 *
 * @param reference - A parsed canonical reference.
 */
export function symbolHref(reference: CanonicalReference): string | undefined {
  if (reference.isPrivate) {
    return undefined;
  }
  if (reference.package.startsWith('@hashbrownai/')) {
    return `/api/${reference.package.slice('@hashbrownai/'.length)}/${reference.name}`;
  }
  if (reference.package.startsWith('@angular/')) {
    return `https://angular.dev/api/${reference.package.split('/')[1]}/${reference.name}`;
  }
  return undefined;
}
