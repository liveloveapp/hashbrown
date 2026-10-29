'use client';

import { type ReactNode, useCallback, useId, useState } from 'react';
import styles from './WorkbenchLauncher.module.css';

/** Props for {@link WorkbenchLauncherToggle}. */
export interface WorkbenchLauncherToggleProps {
  /** The lesson's display title. */
  readonly title: string;
  /** The panel to reveal; nothing in it mounts until the reader expands. */
  readonly children: ReactNode;
}

/**
 * The launcher card's interactive half: a button that reveals its children
 * (the workbench panel) and moves focus to them. Collapsed, nothing of the
 * panel is mounted, so no chunk, frame or capture loads.
 */
export function WorkbenchLauncherToggle({
  title,
  children,
}: WorkbenchLauncherToggleProps) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  // Focus the region when it mounts on expand, without an effect.
  const focusRegion = useCallback((element: HTMLDivElement | null) => {
    element?.focus({ preventScroll: false });
  }, []);
  return (
    <aside className={styles.launcher} aria-label="Workbench lesson">
      <div className={styles.bar}>
        <p className={styles.copy}>
          Try this in the workbench: <strong>{title}</strong>
        </p>
        <button
          type="button"
          className={styles.button}
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide the workbench' : 'Open the workbench'}
        </button>
      </div>
      <div id={regionId}>
        {expanded ? (
          <div
            ref={focusRegion}
            role="region"
            aria-label={`${title} workbench`}
            tabIndex={-1}
            className={styles.region}
          >
            {children}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
