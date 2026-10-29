'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
// Type-only: the lesson tables stay on the server.
import type {
  WorkbenchLineRange,
  WorkbenchSourceData,
  WorkbenchSourceHtml,
} from './workbench-lessons';
import styles from './WorkbenchPanel.module.css';

/** Where the Source tab's highlighted files are, before and after fetching. */
export type WorkbenchSourceLoad =
  | { readonly status: 'idle' | 'loading' | 'failed' }
  | { readonly status: 'loaded'; readonly files: WorkbenchSourceHtml['files'] };

const GITHUB = 'https://github.com/liveloveapp/hashbrown/blob';

/**
 * A lesson file on GitHub at the page's commit, at its first highlight.
 *
 * @param commit - The commit the docs were built from.
 * @param file - A lesson file and the page's highlights in it.
 */
export function workbenchSourceHref(
  commit: string,
  file: WorkbenchSourceData['files'][number],
): string {
  const [first] = file.highlights;
  const lines = first ? `#L${first.start}-L${first.end}` : '';
  return `${GITHUB}/${commit}/www/examples/quickstart/${file.path}${lines}`;
}

/**
 * Mark the lines a page's snippets cover in highlighted source: each gets
 * `data-highlighted` and a visually hidden "highlighted" label, so the
 * marker is not color alone.
 *
 * @param html - Highlighted source with `<span class="line" data-line="N">`.
 * @param highlights - The 1-based, inclusive line ranges to mark.
 * @param labelClass - The visually hidden label's class.
 */
export function markWorkbenchHighlights(
  html: string,
  highlights: readonly WorkbenchLineRange[],
  labelClass: string,
): string {
  return html.replace(
    /<span class="line" data-line="(\d+)">/g,
    (tag, value: string) => {
      const line = Number(value);
      return highlights.some(
        (range) => line >= range.start && line <= range.end,
      )
        ? `<span class="line" data-line="${line}" data-highlighted=""><span class="${labelClass}">highlighted</span>`
        : tag;
    },
  );
}

/** Props for {@link WorkbenchSourceView}. */
export interface WorkbenchSourceViewProps {
  readonly source: WorkbenchSourceData;
  readonly load: WorkbenchSourceLoad;
  /** Whether the Source tab is showing, so it can scroll to a highlight. */
  readonly visible: boolean;
}

/**
 * The Source tab: the lesson's files, then the selected file with the page's
 * snippets marked, in a bounded scroll area. If the files cannot load, a
 * note and the GitHub links stand in.
 */
export function WorkbenchSourceView({
  source,
  load,
  visible,
}: WorkbenchSourceViewProps) {
  const [selected, setSelected] = useState(
    () =>
      (
        source.files.find((file) => file.highlights.length > 0) ??
        source.files[0]
      )?.path,
  );
  const file = source.files.find((item) => item.path === selected);
  const html =
    load.status === 'loaded'
      ? load.files.find((item) => item.path === selected)?.html
      : undefined;
  const marked = useMemo(
    () =>
      html && file
        ? markWorkbenchHighlights(html, file.highlights, styles.hidden)
        : undefined,
    [html, file],
  );
  const code = useRef<HTMLDivElement>(null);

  // Scroll the code area, never the page, to the first highlight.
  useEffect(() => {
    const element = code.current;
    if (!visible || !marked || !element) return;
    const first = element.querySelector<HTMLElement>('[data-highlighted]');
    element.scrollTop = first ? Math.max(0, first.offsetTop - 16) : 0;
  }, [visible, marked]);

  if (source.files.length === 0) {
    return <p className={styles.loopback}>No source files for this lesson.</p>;
  }
  if (load.status === 'failed') {
    return (
      <div className={styles.loopback}>
        <p role="status">Couldn&apos;t load the source. Read it on GitHub:</p>
        <ul className={styles.links}>
          {source.files.map((item) => (
            <li key={item.path}>
              <a
                href={workbenchSourceHref(source.commit, item)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.path} <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={styles.source}>
      <ul className={styles.files} aria-label="Lesson files">
        {source.files.map((item) => (
          <li key={item.path}>
            <button
              type="button"
              className={styles.tab}
              aria-current={item.path === selected || undefined}
              onClick={() => setSelected(item.path)}
            >
              {item.path}
            </button>
          </li>
        ))}
      </ul>
      {file && (
        <figure className={styles.file}>
          <figcaption>
            <span>{file.path}</span>
            <a
              href={workbenchSourceHref(source.commit, file)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub ↗
            </a>
          </figcaption>
          {marked ? (
            <div
              ref={code}
              className={styles.code}
              // Focusable so keyboard users can scroll a long file.
              tabIndex={0}
              role="region"
              aria-label={`${file.path} source`}
              // Highlighted at build time from checked-in example source.
              dangerouslySetInnerHTML={{ __html: marked }}
            />
          ) : (
            <p className={styles.note} role="status">
              {load.status === 'loaded'
                ? "This file isn't in the published source."
                : 'Loading source…'}
            </p>
          )}
        </figure>
      )}
    </div>
  );
}
