import Link from 'next/link';
import { CopyPromptButton } from './CopyPromptButton';
import { bySdk, HERO_CODE, quickStartUrl, type Sdk } from './home.content';
import { InstallCommand } from './InstallCommand';
import { SdkSwitch } from './SdkSwitch';
import styles from './HomeHero.module.css';

/**
 * The homepage hero: headline, install command, calls to action and a code
 * panel. Both frameworks' code is highlighted at build time and passed in;
 * the framework toggle picks which one shows.
 *
 * @param props.codeHtml - Highlighted hero code for each framework.
 */
export function HomeHero({ codeHtml }: { codeHtml: Record<Sdk, string> }) {
  return (
    <div className={styles.hero}>
      <div className={styles.copy}>
        <h1>AI chat and agents for your React or Angular app</h1>
        <p className={styles.lead}>
          Hashbrown is a headless TypeScript framework. The model renders your
          components and calls your tools, in the browser, with any provider.
        </p>
        <InstallCommand />
        <div className={styles.actions}>
          <SdkSwitch
            {...bySdk((sdk) => (
              <Link className="hb-btn primary" href={quickStartUrl(sdk)}>
                Quick start →
              </Link>
            ))}
          />
          <CopyPromptButton className="hb-btn" />
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.bar}>
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
            <span className={styles.dot}></span>
          </span>
          <span className={styles.file}>
            <SdkSwitch {...bySdk((sdk) => HERO_CODE[sdk].file)} />
          </span>
        </div>
        <SdkSwitch
          {...bySdk((sdk) => (
            <div
              className={styles.code}
              dangerouslySetInnerHTML={{ __html: codeHtml[sdk] }}
            />
          ))}
        />
        <div className={styles.result} aria-hidden="true">
          <div className={styles.bubble}>
            Show me Acme&apos;s overdue invoice
          </div>
          <div className={styles.invoice}>
            <strong>INV-1042 · Acme Corp</strong>
            <span className={styles.tag}>62 days overdue</span>
            <span>$12,480.00 · due Jul 22</span>
          </div>
          <div className={styles.streaming}>
            &lt;InvoiceCard&gt; streaming <span className={styles.caret}></span>
          </div>
        </div>
      </div>
    </div>
  );
}
