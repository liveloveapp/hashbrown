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
        <div className={styles.text}>
          <div className={styles.big}>
            Your chat UI
            <br />
            <em>isn&apos;t done.</em>
          </div>
          <p>
            threadplane is the full agent UI for React and Angular: threads,
            approvals, and tool progress. Free and MIT, with enterprise support
            from the team behind Hashbrown.
          </p>
          <span className={styles.cta}>Explore threadplane →</span>
        </div>
        <img
          src="/image/landing-page/threadplane/brian-skeptical.webp"
          alt="Brian Love"
          loading="lazy"
          width={840}
          height={900}
        />
      </a>
    </div>
  );
}
