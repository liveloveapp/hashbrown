import Link from 'next/link';
import { parseCanonicalReference } from '../../lib/canonical-reference';
import styles from './chips.module.css';

/** The fields a symbol chip needs; both report entries and members have them. */
export interface SymbolChipSymbol {
  kind: string;
  name: string;
  canonicalReference: string;
}

/**
 * The page URL for a Hashbrown canonical reference, as the Angular chip built
 * it: `/api/<package without scope>/<name>`, where the name keeps its
 * namespace (`s.string`).
 *
 * @param canonicalReference - e.g. `@hashbrownai/core!s.string:function(1)`.
 */
export function symbolPageHref(canonicalReference: string): string {
  const parsed = parseCanonicalReference(canonicalReference);
  const pkg = (parsed?.package ?? '').split('/').slice(1).join('/');
  return `/api/${pkg}/${parsed?.name ?? ''}`;
}

/** A symbol's kind initial and name, linking to its page. Port of `SymbolChip`. */
export function SymbolChip({ symbol }: { symbol: SymbolChipSymbol }) {
  return (
    <Link
      href={symbolPageHref(symbol.canonicalReference)}
      className={`underline ${styles.chip}`}
    >
      <span className={`kind ${symbol.kind} ${styles.initial}`}>
        {symbol.kind.charAt(0).toUpperCase()}
      </span>
      {` ${symbol.name}`}
    </Link>
  );
}
