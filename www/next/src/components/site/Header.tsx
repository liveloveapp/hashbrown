import Link from 'next/link';
import type { ReactNode } from 'react';
import { GitHubStarButton } from './GitHubStarButton';
import { DEFAULT_SDK, docsUrl, quickStartUrl, type Sdk } from './links';
import { MobileMenu } from './MobileMenu';
import { NavLink } from './NavLink';
import { SearchButton } from './SearchButton';
import styles from './Header.module.css';

/**
 * The site header: logo, main navigation, search trigger, GitHub stars and
 * quick start link, with a fullscreen menu below 768px. Ports the Angular
 * `www-header`.
 *
 * @param props.sdk - The SDK the docs and quick start links point to.
 *   Defaults to `angular`, the Angular `ConfigService` default.
 * @param props.docsMenu - The docs menu shown in the mobile menu's docs tab.
 * @param props.apiMenu - The API menu shown in the mobile menu's api tab.
 */
export function Header({
  sdk = DEFAULT_SDK,
  docsMenu,
  apiMenu,
}: {
  sdk?: Sdk;
  docsMenu?: ReactNode;
  apiMenu?: ReactNode;
}) {
  const active = styles.active;

  return (
    <header className={styles.header}>
      <menu className={styles.bar}>
        <div className={styles.left}>
          <Link href="/">
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height={24} />
          </Link>
        </div>
        <div className={styles.right}>
          <nav aria-label="Main">
            <ul>
              <li>
                <NavLink href={docsUrl(sdk)} activeClassName={active}>
                  docs
                </NavLink>
              </li>
              <li>
                <NavLink href="/api" activeClassName={active}>
                  api
                </NavLink>
              </li>
              <li>
                <NavLink href="/samples" activeClassName={active}>
                  example
                </NavLink>
              </li>
              <li>
                <NavLink href="/blog" activeClassName={active}>
                  blog
                </NavLink>
              </li>
              <li>
                <SearchButton />
              </li>
              <li>
                <GitHubStarButton />
              </li>
              <li>
                <Link className={styles.quickStart} href={quickStartUrl(sdk)}>
                  Quick start
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className={styles.menu}>
          <MobileMenu sdk={sdk} docsMenu={docsMenu} apiMenu={apiMenu} />
        </div>
      </menu>
    </header>
  );
}
