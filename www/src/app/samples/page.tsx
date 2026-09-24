import type { Metadata } from 'next';
import { Samples } from '../../components/samples/Samples';
import { Footer } from '../../components/site/Footer';
import { Header } from '../../components/site/Header';
import { pageMetadata } from '../../lib/site-metadata';
import styles from './samples.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Hashbrown Invoicing Example',
  description:
    'Explore the React, B4 and Pretable invoicing example with a simulated ledger and explicit allocation reviews.',
});

/** The example page: the maintained invoicing example (port of `samples/index.page.ts`). */
export default function SamplesIndexPage() {
  return (
    <>
      <Header />
      <main>
        <h1 className={styles.heading}>Hashbrown example</h1>
        <Samples />
      </main>
      <Footer />
    </>
  );
}
