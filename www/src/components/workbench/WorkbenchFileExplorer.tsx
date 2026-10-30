'use client';

import { useId, useRef, useState } from 'react';
import type { WorkbenchSourceData } from './workbench-lessons';
import styles from './WorkbenchPanel.module.css';

/** Props for the lesson's responsive folder explorer. */
export interface WorkbenchFileExplorerProps {
  readonly files: WorkbenchSourceData['files'];
  readonly selected: string | undefined;
  readonly onSelect: (path: string) => void;
  /** A new snippet request reveals the selected file's folders again. */
  readonly request?: number;
}

/**
 * Lesson files in their real directories. The same navigation becomes an
 * initially collapsed picker when its containing workbench is narrow.
 */
export function WorkbenchFileExplorer({
  files,
  selected,
  onSelect,
  request,
}: WorkbenchFileExplorerProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const choose = (path: string) => {
    onSelect(path);
    setExpanded(false);
    if (expanded) toggle.current?.focus({ preventScroll: true });
  };

  return (
    <aside className={styles.explorer} data-expanded={expanded}>
      <button
        ref={toggle}
        type="button"
        className={styles.filePicker}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles.pickerLabel}>Files</span>
        <span className={styles.filename}>{selected?.split('/').at(-1)}</span>
        <span className={styles.pickerChevron} data-expanded={expanded}>
          <SourceIcon name="chevron" />
        </span>
      </button>
      <nav id={id} className={styles.fileNavigation} aria-label="Lesson files">
        <div className={styles.explorerHeading}>Explorer</div>
        <FileEntries
          key={request}
          files={files}
          selected={selected}
          onSelect={choose}
          prefix=""
        />
      </nav>
    </aside>
  );
}

/** Render one directory level without changing the source file list. */
function FileEntries({
  files,
  selected,
  onSelect,
  prefix,
}: Omit<WorkbenchFileExplorerProps, 'request'> & {
  readonly prefix: string;
}) {
  const names = [
    ...new Set(
      files.map((file) => file.path.slice(prefix.length).split('/')[0]),
    ),
  ];

  return (
    <ul className={styles.files}>
      {names.map((name) => {
        const path = `${prefix}${name}`;
        const file = files.find((item) => item.path === path);
        return (
          <li key={path}>
            {file ? (
              <button
                type="button"
                className={styles.fileButton}
                aria-label={path}
                title={path}
                aria-current={path === selected}
                onClick={() => onSelect(path)}
              >
                <SourceIcon />
                <span className={styles.filename}>{name}</span>
              </button>
            ) : (
              <details className={styles.directory} open>
                <summary>
                  <SourceIcon name="folder" />
                  <span className={styles.filename}>{name}</span>
                  <span className={styles.folderChevron}>
                    <SourceIcon name="chevron" />
                  </span>
                </summary>
                <FileEntries
                  files={files.filter((item) =>
                    item.path.startsWith(`${path}/`),
                  )}
                  selected={selected}
                  onSelect={onSelect}
                  prefix={`${path}/`}
                />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The workbench's file-code and chevron paths, with a matching folder icon. */
function SourceIcon({
  name = 'file-code',
}: {
  readonly name?: 'file-code' | 'folder' | 'chevron';
}) {
  return (
    <svg
      className={styles.sourceIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'chevron' ? (
        <polyline points="6 9 12 15 18 9" />
      ) : name === 'folder' ? (
        <path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z" />
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M10 13l-2 2 2 2M14 17l2-2-2-2" />
        </>
      )}
    </svg>
  );
}
