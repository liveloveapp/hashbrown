'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import styles from './Diagram.module.css';

/** Only the optional expansion is interactive. Diagram markup is supplied by the server. */
export function DiagramFrame({
  id,
  title,
  caption,
  description,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  description: string;
  children: ReactNode;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(true);
  useEffect(() => {
    const region = viewport.current;
    if (!region) return;
    const measure = () =>
      setOverflows(region.scrollWidth > region.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);
  function open() {
    setExpanded(true);
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
  }
  return (
    <figure
      className={styles.figure}
      data-diagram={id}
      aria-labelledby={`${uid}-title`}
    >
      <div className={styles.header}>
        <p id={`${uid}-title`} className={styles.title}>
          {title}
        </p>
        <button
          ref={trigger}
          type="button"
          className={styles.button}
          onClick={open}
          aria-haspopup="dialog"
          aria-controls={`${uid}-dialog`}
        >
          Expand diagram <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className={styles.scrollHint} hidden={!overflows}>
        Scroll horizontally to see the full diagram, or expand it.
      </p>
      <div
        ref={viewport}
        className={styles.viewport}
        tabIndex={0}
        role="region"
        aria-label={`${title}. Scroll horizontally to explore.`}
      >
        {children}
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
      <details className={styles.description}>
        <summary>Read the diagram</summary>
        <p>{description}</p>
      </details>
      <dialog
        id={`${uid}-dialog`}
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${uid}-expanded-title`}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          // Keep cycling through the frame's controls, including the text
          // alternative, even when the browser would move focus to its chrome.
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button, [tabindex="0"], summary',
            ),
          );
          const target = event.shiftKey ? controls.at(-1) : controls[0];
          const boundary = event.shiftKey ? controls[0] : controls.at(-1);
          if (target && document.activeElement === boundary) {
            event.preventDefault();
            target.focus();
          }
        }}
        onClose={() => {
          setExpanded(false);
          trigger.current?.focus();
        }}
      >
        <div className={styles.header}>
          <p id={`${uid}-expanded-title`} className={styles.title}>
            {title}
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={close}
            autoFocus
          >
            Close <span aria-hidden="true">×</span>
          </button>
        </div>
        {expanded && (
          <div
            className={styles.viewport}
            tabIndex={0}
            role="region"
            aria-label={`${title}. Expanded diagram.`}
          >
            {children}
          </div>
        )}
        <p className={styles.caption}>{caption}</p>
        <details className={styles.description}>
          <summary>Read the diagram</summary>
          <p>{description}</p>
        </details>
      </dialog>
    </figure>
  );
}
