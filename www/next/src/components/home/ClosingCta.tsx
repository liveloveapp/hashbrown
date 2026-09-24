import Link from 'next/link';
import { bySdk, GITHUB_URL, quickStartUrl } from './home.content';
import { InstallCommand } from './InstallCommand';
import { SdkSwitch } from './SdkSwitch';
import styles from './ClosingCta.module.css';

/** The closing "Get started" card with the install command and calls to action. */
export function ClosingCta() {
  return (
    <div className={styles.section}>
      <div className={styles.card}>
        <img src="/image/logo/brand-mark.svg" alt="" width={56} height={56} />
        <h2>Get started</h2>
        <InstallCommand centered />
        <div className={styles.actions}>
          <SdkSwitch
            {...bySdk((sdk) => (
              <Link className="hb-btn primary" href={quickStartUrl(sdk)}>
                Quick start →
              </Link>
            ))}
          />
          <a
            className="hb-btn"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
