import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  parseCanonicalReference,
  symbolHref,
} from '../lib/canonical-reference';
import { SymbolPopover } from './api/SymbolPopover';
import styles from './SymbolLink.module.css';

/** Props of {@link SymbolLink}. */
export interface SymbolLinkProps {
  /** The canonical reference, e.g. `@hashbrownai/react!useChat:function`. */
  reference?: string;
  /**
   * Server-rendered popover body shown on hover. Only internal API links use
   * it; private, unknown and external (angular.dev) references ignore it.
   */
  popover?: ReactNode;
}

/**
 * `<hb-symbol-link reference>`: a link to an API symbol, or plain text when it
 * has no page. Given a `popover`, an internal link opens it on hover, like
 * Angular's `SymbolLink`. Stays a server component; only the hover behavior
 * (`SymbolPopover`) runs on the client.
 */
export function SymbolLink({ reference = '', popover }: SymbolLinkProps) {
  const parsed = parseCanonicalReference(reference);
  if (!parsed) {
    return <>{reference}</>;
  }
  const href = symbolHref(parsed);
  if (!href) {
    return <>{parsed.name}</>;
  }
  if (href.startsWith('http')) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={styles.link}
        data-symbol-link=""
      >
        {parsed.name}
      </a>
    );
  }
  const link = (
    <Link href={href} className={styles.link} data-symbol-link="">
      {parsed.name}
    </Link>
  );
  return popover ? (
    <SymbolPopover reference={reference} content={popover}>
      {link}
    </SymbolPopover>
  ) : (
    link
  );
}
