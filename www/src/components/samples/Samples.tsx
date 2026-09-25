import type { Sdk } from '../site/links';
import { QuickStartLink } from './QuickStartLink';
import styles from './Samples.module.css';
import { WALKTHROUGH_VIDEO_URL } from './walkthrough';

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
          payment allocations before applying them. Built with React, Hashbrown,
          B4, and Pretable. All data is simulated.
        </p>
        <figure className={styles.walkthrough}>
          {/* Silent, with captions burned in, and hosted on Vercel Blob
              (see walkthrough.ts). Loads only when played. */}
          <video
            src={WALKTHROUGH_VIDEO_URL}
            poster="/image/landing-page/invoicing-walkthrough.webp"
            width={1920}
            height={1080}
            controls
            muted
            playsInline
            preload="none"
          />
          <figcaption>
            Walkthrough: streamed answers, model-chosen components, and one
            approval for a payment that covers two invoices.
          </figcaption>
        </figure>
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
