import type { Metadata } from 'next';
import { BrandKit } from '../../components/brand/BrandKit';
import brand from '../../components/brand/BrandKit.module.css';
import styles from '../../components/layout/SectionShell.module.css';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';
import { DEFAULT_CARD_IMAGE, pageMetadata } from '../../lib/site-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Brand: Hashbrown',
  description:
    'Hashbrown logos, share cards, colours and type, ready to download.',
  image: DEFAULT_CARD_IMAGE,
  path: '/brand',
});

/** The brand kit, in the blog shell. */
export default function BrandPage() {
  return (
    <div className={`${styles.shell} ${styles.blog} ${brand.column}`}>
      <Header />
      <div className={styles.blogPanel}>
        <BrandKit />
        <Footer />
      </div>
    </div>
  );
}
