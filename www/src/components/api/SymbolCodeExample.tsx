import type { ReactNode } from 'react';
import styles from './SymbolCodeExample.module.css';

/**
 * The titled dark panel symbol pages use for signatures and members: the
 * Angular `CodeExample` with `copyable=false`, header actions and an id.
 */
export function SymbolCodeExample({
  header,
  id,
  actions,
  children,
}: {
  header: string;
  id?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.host} id={id}>
      <div className={styles.example}>
        <div className={styles.header}>
          <span className={styles.active}>{header}</span>
          <div>{actions}</div>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
