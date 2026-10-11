import { AtcLoop } from './AtcLoop';
import { ATC_LINKS } from './home.content';
import styles from './RealApp.module.css';

/** The atc example showcase: what it shows, links, and the app in motion. */
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
          {/* A loop on wide screens and a screenshot on phones, each with its
              own description. The hidden one is display: none, so neither
              loads where it is not shown. */}
          <AtcLoop
            className={styles.desktop}
            label="The atc example answering what is landing at Seattle: the question is typed, an arrivals board streams into the chat, and the map zooms to Seattle and highlights the three arriving planes"
          />
          <img
            className={styles.phone}
            src="/image/landing-page/atc-mobile.webp"
            alt="The atc example on a phone answering what is flying near Bend: a nearby-traffic board in the chat sheet under a map of central Oregon that circles Bend and labels the highlighted planes"
            loading="lazy"
            width={585}
            height={1266}
          />
        </a>
      </div>
    </div>
  );
}
