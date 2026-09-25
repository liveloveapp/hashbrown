import { INVOICING_LINKS } from './home.content';
import styles from './RealApp.module.css';

/** The invoicing showcase: what it's built with, links, and a screenshot. */
export function RealApp() {
  const links = INVOICING_LINKS;

  return (
    <div className={styles.section}>
      <div className={styles.card}>
        <div>
          <h2>See it in a real app</h2>
          <p>
            An invoicing assistant that answers with the app&apos;s own tables
            and charts. The data is simulated.
          </p>
          <div className={styles.built}>
            <div className={styles.tile}>
              <strong>hashbrown</strong>
              <span>Chat and generative UI</span>
            </div>
            <a
              className={styles.tile}
              href={links.b4}
              target="_blank"
              rel="noopener"
            >
              <strong>b4.run ↗</strong>
              <span>Agent backend</span>
            </a>
            <a
              className={styles.tile}
              href={links.pretable}
              target="_blank"
              rel="noopener"
            >
              <strong>pretable.ai ↗</strong>
              <span>Data grid</span>
            </a>
          </div>
          <div className={styles.actions}>
            <a
              className="hb-btn primary"
              href={links.app}
              target="_blank"
              rel="noopener"
            >
              Try the app ↗
            </a>
            <a
              className="hb-btn"
              href={links.source}
              target="_blank"
              rel="noopener"
            >
              Read the source
            </a>
          </div>
        </div>
        <a
          className={styles.shot}
          href={links.app}
          target="_blank"
          rel="noopener"
        >
          <picture>
            <source
              media="(max-width: 767px)"
              srcSet="/image/landing-page/invoicing-mobile.webp"
              width={585}
              height={1100}
            />
            <img
              src="/image/landing-page/invoicing.webp"
              alt="The invoicing example answering which USD customers are more than 60 days overdue with a ledger table, an aging chart, and a customer card"
              loading="lazy"
              width={1400}
              height={1200}
            />
          </picture>
        </a>
      </div>
    </div>
  );
}
