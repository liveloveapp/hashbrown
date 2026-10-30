import type { ReactNode } from 'react';
import styles from './CodeExample.module.css';
import { CopyButton } from './CopyButton';
import { SeeItRunButton } from './SeeItRunButton';

/** Props of `<hb-code-example>`; attribute values arrive as strings. */
export interface CodeExampleProps {
  header?: string;
  copyable?: string;
  run?: string;
  /** A stable id for the example; assigned from order and header when rendering markdown. */
  id?: string;
  /** A workbench replay milestone; adds a See it run button that seeks to it. */
  moment?: string;
  /**
   * The lines a workbench snippet quotes in its file, set at build time (see
   * `workbenchPageData`); See it run scrolls the Source tab to them.
   */
  lines?: { readonly start: number; readonly end: number };
  children?: ReactNode;
}

/**
 * `<hb-code-example header copyable run moment>`: a titled, copyable code
 * panel. With `moment`, a See it run button jumps the page's workbench
 * replay to that milestone.
 */
export function CodeExample({
  header = '',
  copyable,
  run,
  id,
  moment,
  lines,
  children,
}: CodeExampleProps) {
  return (
    <div
      className={styles.example}
      data-component="code-example"
      data-header={header}
      data-lines={lines ? `${lines.start}-${lines.end}` : undefined}
      id={id}
    >
      <div className={styles.header}>
        <span className={styles.active}>{header}</span>
        <div>
          {moment && id ? (
            <SeeItRunButton
              moment={moment}
              snippet={id}
              header={header}
              lines={lines}
            />
          ) : null}
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
