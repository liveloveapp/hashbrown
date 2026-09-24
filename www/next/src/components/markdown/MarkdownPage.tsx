import type { ReactNode } from 'react';
import type { Heading } from '../../lib/rehype-heading-ids';
import styles from './MarkdownPage.module.css';
import { TableOfContents } from './TableOfContents';

/**
 * A rendered markdown page: the article typography from the Analog
 * `MarkdownPage`, plus the on-page table of contents on wide screens.
 */
export function MarkdownPage({
  headings,
  children,
}: {
  headings: Heading[];
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <article className={styles.article}>{children}</article>
      <TableOfContents headings={headings} />
    </div>
  );
}
