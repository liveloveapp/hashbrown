import Link from 'next/link';
import { ArrowUpRightIcon, BrandGitHubIcon, BrandLinkedInIcon } from './icons';
import { GITHUB_REPO_URL, type Sdk } from './links';
import { SdkLink } from './SdkLink';
import styles from './Footer.module.css';

const external = { target: '_blank', rel: 'noopener' } as const;

const Arrow = () => <ArrowUpRightIcon height="12px" width="12px" />;

/**
 * The site footer: brand and copyright, documentation, learn and team link
 * columns, and social links. Ports the Angular `www-footer`.
 *
 * @param props.sdk - The SDK the docs link points to. Omit it to follow the
 *   reader's saved preference (Angular by default).
 */
export function Footer({ sdk }: { sdk?: Sdk } = {}) {
  const currentYear = new Date().getFullYear();

  return (
    <div className={styles.root}>
      <footer className={styles.footer}>
        <div className={styles.links}>
          <div className={styles.brand}>
            <div className={styles.title}>
              <img src="/image/logo/word-mark.svg" alt="hashbrown" height={24} />
            </div>
            <small>
              © LiveLoveApp, LLC {currentYear}. <br />
              <a href="https://analogjs.org" {...external}>
                Built with AnalogJS
                <Arrow />
              </a>
            </small>
          </div>
          <div className={styles.docs}>
            <div className={styles.title}>Documentation</div>
            <ul>
              <li>
                <SdkLink to="docs" sdk={sdk} className="underline">
                  Docs
                </SdkLink>
              </li>
              <li>
                <Link href="/api" className="underline">
                  API Reference
                </Link>
              </li>
              <li>
                <Link href="/samples" className="underline">
                  Examples
                </Link>
              </li>
              <li>
                <a href="/llms.txt" {...external} className="underline">
                  llms.txt
                  <Arrow />
                </a>
              </li>
              <li>
                <a href="/llms-full.txt" {...external} className="underline">
                  llms-full.txt
                  <Arrow />
                </a>
              </li>
            </ul>
          </div>
          <div className={styles.learn}>
            <div className={styles.title}>Learn</div>
            <ul>
              <li>
                <Link href="/blog" className="underline">
                  Blog
                </Link>
              </li>
            </ul>
          </div>
          <div className={styles.team}>
            <div className={styles.title}>More from the team</div>
            <ul>
              <li>
                <a
                  href="https://threadplane.ai/?utm_source=hashbrown&utm_medium=footer"
                  {...external}
                  className="underline"
                >
                  threadplane.ai
                  <Arrow />
                </a>
              </li>
              <li>
                <a href="https://b4.run" {...external} className="underline">
                  b4.run
                  <Arrow />
                </a>
              </li>
              <li>
                <a href="https://pretable.ai" {...external} className="underline">
                  pretable.ai
                  <Arrow />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.bottom}>
          <span></span>
          <ul>
            <li>
              <a
                href="https://www.linkedin.com/company/liveloveapp"
                {...external}
                aria-label="Hashbrown on LinkedIn"
              >
                <BrandLinkedInIcon />
              </a>
            </li>
            <li>
              <a
                href={GITHUB_REPO_URL}
                {...external}
                aria-label="Hashbrown on GitHub"
              >
                <BrandGitHubIcon />
              </a>
            </li>
          </ul>
        </div>
      </footer>
      <div className={styles.stripe}></div>
    </div>
  );
}
