import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import styles from '../../../components/layout/SectionShell.module.css';
import { ApiMenu } from '../../../components/menus/ApiMenu';
import { DocsMenu } from '../../../components/menus/DocsMenu';
import { Header } from '../../../components/site/Header';
import { type Sdk, SDKS } from '../../../lib/content';
import { pageMetadata } from '../../../lib/site-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Home: Hashbrown Docs',
  description: 'Hashbrown Docs.',
});

/** Pre-render both SDK sections. */
export function generateStaticParams() {
  return SDKS.map((sdk) => ({ sdk }));
}

/** Docs shell: header, docs menu, white article panel (port of docs.page.ts). */
export default async function DocsLayout({
  params,
  children,
}: {
  params: Promise<{ sdk: string }>;
  children: ReactNode;
}) {
  const { sdk } = await params;
  const current: Sdk = sdk === 'angular' ? 'angular' : 'react';
  return (
    <div className={`${styles.shell} ${styles.docs}`}>
      <Header
        sdk={current}
        docsMenu={<DocsMenu sdk={current} />}
        apiMenu={<ApiMenu />}
      />
      <main className={styles.grid}>
        <div className={styles.menu}>
          <DocsMenu sdk={current} />
        </div>
        <div className={styles.panel}>{children}</div>
      </main>
    </div>
  );
}
