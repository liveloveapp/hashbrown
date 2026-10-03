import { THREADPLANE_URL } from './home.content';
import styles from './ThreadplaneBanner.module.css';

/** The banner that links to threadplane, the full agent UI built on Hashbrown. */
export function ThreadplaneBanner() {
  return (
    <div className={styles.section}>
      <a
        className={styles.banner}
        href={THREADPLANE_URL}
        target="_blank"
        rel="noopener"
      >
        <h2 className={styles.big}>Need enterprise chat UI for your agents?</h2>
        <p>
          threadplane is the full agent UI for React and Angular: threads,
          approvals, and tool progress. Free and MIT, with enterprise support
          from the team behind Hashbrown.
        </p>
        <span className={styles.cta}>Explore threadplane →</span>
      </a>
    </div>
  );
}
