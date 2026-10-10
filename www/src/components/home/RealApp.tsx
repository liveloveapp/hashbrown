import { ATC_LINKS } from './home.content';
import styles from './RealApp.module.css';

/** The atc example showcase: what it shows, links, and a screenshot. */
export function RealApp() {
  const links = ATC_LINKS;

  return (
    <div className={styles.section}>
      <div className={styles.card}>
        <div>
          <h2>See it in a real app</h2>
          <p>
            atc is a live map of the planes over the Pacific Northwest. Ask
            about them, and the assistant answers with the app&apos;s own flight
            cards and arrivals boards.
          </p>
          <div className={styles.built}>
            <div className={styles.tile}>
              <strong>Your components</strong>
              <span>The model picks the cards and boards</span>
            </div>
            <div className={styles.tile}>
              <strong>Tools in the browser</strong>
              <span>Search, highlight and follow planes on the map</span>
            </div>
            <div className={styles.tile}>
              <strong>Angular and React</strong>
              <span>The same app, built in both</span>
            </div>
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
              srcSet="/image/landing-page/atc-mobile.webp"
              width={585}
              height={1266}
            />
            <img
              src="/image/landing-page/atc.webp"
              alt="The atc example answering which planes are the highest and fastest right now, with two flight cards beside a map that highlights both planes"
              loading="lazy"
              width={1440}
              height={900}
            />
          </picture>
        </a>
      </div>
    </div>
  );
}
