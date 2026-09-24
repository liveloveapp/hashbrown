import Link from 'next/link';
import {
  parseCanonicalReference,
  symbolHref,
} from '../lib/canonical-reference';
import styles from './SymbolLink.module.css';

/** `<hb-symbol-link reference>`: a link to an API symbol, or plain text when it has no page. */
export function SymbolLink({ reference = '' }: { reference?: string }) {
  const parsed = parseCanonicalReference(reference);
  if (!parsed) {
    return <>{reference}</>;
  }
  const href = symbolHref(parsed);
  if (!href) {
    return <>{parsed.name}</>;
  }
  return href.startsWith('http') ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={styles.link}
      data-symbol-link=""
    >
      {parsed.name}
    </a>
  ) : (
    <Link href={href} className={styles.link} data-symbol-link="">
      {parsed.name}
    </Link>
  );
}
