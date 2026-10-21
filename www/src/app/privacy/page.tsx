import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDocsMarkdown } from '../../components/docs-markdown';
import styles from '../../components/layout/SectionShell.module.css';
import { MarkdownPage } from '../../components/markdown/MarkdownPage';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';
import { repoRoot } from '../../lib/repo-root';
import { DEFAULT_CARD_IMAGE, pageMetadata } from '../../lib/site-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy: Hashbrown',
  description:
    'What Hashbrown collects, who processes it, and how to opt out or ask for deletion.',
  image: DEFAULT_CARD_IMAGE,
});

/**
 * The privacy page: `www/content/privacy.md` rendered with the docs
 * typography inside the blog shell.
 */
export default async function PrivacyPage() {
  const source = readFileSync(
    join(repoRoot(), 'www/content/privacy.md'),
    'utf-8',
  );
  const { content, headings } = await renderDocsMarkdown(source, 'react');
  return (
    <div className={`${styles.shell} ${styles.blog}`}>
      <Header />
      <div className={styles.blogPanel}>
        <MarkdownPage headings={headings}>{content}</MarkdownPage>
        <Footer />
      </div>
    </div>
  );
}
