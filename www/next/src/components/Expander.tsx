'use client';

import { useState, type ReactNode } from 'react';
import styles from './Expander.module.css';
import { ChevronDownIcon } from './icons';

/** `<hb-expander title>`: a collapsible section, closed by default. */
export function Expander({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={open ? `${styles.expander} ${styles.open}` : styles.expander}>
      <button
        type="button"
        className={styles.title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon />
        <span>{title}</span>
      </button>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
