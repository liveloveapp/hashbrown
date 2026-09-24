import type { ReactNode } from 'react';
import styles from './samples.module.css';

/** Samples section wrapper (port of `samples.page.ts`). */
export default function SamplesLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
