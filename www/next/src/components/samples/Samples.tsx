import type { Sdk } from '../site/links';
import { QuickStartLink } from './QuickStartLink';
import styles from './Samples.module.css';

/**
 * Presents the maintained, simulated invoicing example. Ports the Angular
 * `www-samples` (`components/home/Samples.ts`).
 *
 * @param props.sdk - Force the SDK for "Build your own"; by default it follows
 *   the reader's stored preference.
 */
export function Samples({ sdk }: { sdk?: Sdk } = {}) {
  return (
    <div className={styles.host}>
      <section aria-labelledby="example-heading" className={styles.section}>
        <h2 id="example-heading">Invoicing with an AI assistant</h2>
        <p>
          Ask questions about a ledger, explore generated views, and review
          payment allocations before applying them. Built with React,
          Hashbrown, B4, and Pretable. All data is simulated.
        </p>
        <nav aria-label="Invoicing example">
          <a href="https://invoicing.hashbrown.dev">Try the invoicing app</a>
          <a href="https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing">
            Read the source
          </a>
          <QuickStartLink sdk={sdk}>Build your own</QuickStartLink>
        </nav>
      </section>
    </div>
  );
}
