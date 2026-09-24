import Link from 'next/link';
import { bySdk, CAPABILITIES, capabilityDocsUrl } from './home.content';
import { SdkSwitch } from './SdkSwitch';
import styles from './Capabilities.module.css';

/** The "Features" grid: six capability groups, each linking to the selected framework's docs. */
export function Capabilities() {
  return (
    <div className={styles.section}>
      <header className={styles.header}>
        <h2>Features</h2>
      </header>
      <div className={styles.grid}>
        {CAPABILITIES.map((capability) => (
          <article key={capability.title}>
            <h3>{capability.title}</h3>
            <p>{capability.body}</p>
            <SdkSwitch
              {...bySdk((sdk) => (
                <Link
                  href={capabilityDocsUrl(sdk, capability)}
                  aria-label={`Read the docs: ${capability.title}`}
                >
                  Read the docs
                </Link>
              ))}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
