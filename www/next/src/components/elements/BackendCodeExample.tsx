'use client';

import { type ReactNode, useRef, useState } from 'react';
import { type Backend, BACKENDS } from '../../lib/site-config';
import { CopyIcon } from '../icons';
import { useSiteConfig } from '../use-site-config';
import styles from './BackendCodeExample.module.css';

/** Props of `<hb-backend-code-example>`; attribute values arrive as strings. */
export interface BackendCodeExampleProps {
  /** `"false"` hides the copy button. */
  copyable?: string;
  /** Optional link shown as "run". */
  run?: string;
  /** One `<div backend="express|fastify|nestjs|hono">` per backend. */
  children?: ReactNode;
}

const titleCase = (value: string) =>
  value.replace(
    /\w\S*/g,
    (word) => word[0].toUpperCase() + word.slice(1).toLowerCase(),
  );

/**
 * `<hb-backend-code-example>`: code for each Node.js backend behind tabs.
 * Children carry a `backend` attribute; CSS shows the selected one. The
 * selection is the site-wide `backend` preference, so it persists across pages
 * and reloads. Server and hydration renders show the default backend.
 */
export function BackendCodeExample({
  copyable,
  run,
  children,
}: BackendCodeExampleProps) {
  const { config, update } = useSiteConfig();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const selectBackend = (backend: Backend) => update({ backend });

  const onCopy = async () => {
    const el = contentRef.current;
    // innerText skips the hidden backends.
    const text = el?.innerText || el?.textContent || '';
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <div className={styles.example} data-component="backend-code-example">
      <div className={styles.header}>
        <div className={styles.tabs}>
          {BACKENDS.map((backend) => (
            <button
              key={backend}
              type="button"
              className={styles.tab}
              aria-pressed={config.backend === backend}
              aria-label={titleCase(`Switch to ${backend}`)}
              onClick={() => selectBackend(backend)}
            >
              {titleCase(backend)}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          {run ? <a href={run}>run</a> : null}
          {copyable === 'false' ? null : (
            <button
              type="button"
              aria-label="Copy code to clipboard"
              onClick={onCopy}
            >
              {copied ? 'copied' : <CopyIcon />}
            </button>
          )}
        </div>
      </div>
      <div
        ref={contentRef}
        className={styles.content}
        data-backend={config.backend}
      >
        {children}
      </div>
    </div>
  );
}
