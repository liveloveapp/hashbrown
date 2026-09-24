import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import styles from '../../components/layout/SectionShell.module.css';
import { ApiMenu } from '../../components/menus/ApiMenu';
import { DocsMenu } from '../../components/menus/DocsMenu';
import { Header } from '../../components/site/Header';
import { pageMetadata } from '../../lib/site-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Home: Hashbrown API',
  description: 'Hashbrown API documentation.',
});

/** API reference shell: header, API menu, white panel (port of api.page.ts). */
export default function ApiLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.shell} ${styles.api}`}>
      <Header docsMenu={<DocsMenu sdk="angular" />} apiMenu={<ApiMenu />} />
      <main className={styles.grid}>
        <div className={styles.menu}>
          <ApiMenu />
        </div>
        <div className={styles.panel}>{children}</div>
      </main>
    </div>
  );
}
