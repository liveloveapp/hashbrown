import type { ReactNode } from 'react';
import styles from '../../components/layout/SectionShell.module.css';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';

/** Blog shell: header, white container with the footer (port of blog.page.ts). */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.shell} ${styles.blog}`}>
      <Header />
      <div className={styles.blogPanel}>
        {children}
        <Footer />
      </div>
    </div>
  );
}
