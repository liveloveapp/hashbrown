import Link from 'next/link';
import { Header } from '../site/Header';
import styles from './RetiredSample.module.css';

/**
 * The page left at a retired example's URL, pointing readers to the
 * maintained invoicing example. Ports `samples/{finance,fast-food,smart-home}.page.ts`.
 *
 * @param props.name - The retired example's name, e.g. `Finance`.
 */
export function RetiredSample({ name }: { name: string }) {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1>{name} example retired</h1>
        <p>This legacy example is no longer maintained.</p>
        <p>
          <Link href="/samples">Explore the maintained invoicing example</Link>,
          built with React, Hashbrown, B4 and Pretable using simulated data.
        </p>
      </main>
    </>
  );
}
