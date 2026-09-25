import type { ReactNode } from 'react';
import styles from './CodeExample.module.css';
import { CopyButton } from './CopyButton';

/** Props of `<hb-code-example>`; attribute values arrive as strings. */
export interface CodeExampleProps {
  header?: string;
  copyable?: string;
  run?: string;
  children?: ReactNode;
}

/** `<hb-code-example header copyable run>`: a titled, copyable code panel. */
export function CodeExample({
  header = '',
  copyable,
  run,
  children,
}: CodeExampleProps) {
  return (
    <div className={styles.example} data-component="code-example">
      <div className={styles.header}>
        <span className={styles.active}>{header}</span>
        <div>
          {run ? <a href={run}>run</a> : null}
          {copyable === 'false' ? null : <CopyButton />}
        </div>
      </div>
      <div className={styles.content} data-content="">
        {children}
      </div>
    </div>
  );
}
