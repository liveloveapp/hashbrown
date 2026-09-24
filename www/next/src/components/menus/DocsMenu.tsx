import { listDocs, type Sdk, SDKS } from '../../lib/content';
import styles from './DocsMenu.module.css';
import { docsMenuSections } from './docs-menu.data';
import { MenuLink } from './MenuLink';
import { SdkSwitcher } from './SdkSwitcher';
import { SearchButton } from './SearchButton';

/**
 * The docs side menu: SDK switcher, search trigger and the section links,
 * ported from the Angular `DocsMenu`.
 *
 * @param props.sdk - The SDK whose docs the links point to.
 * @param props.className - Extra classes for the root, e.g. layout rules.
 */
export function DocsMenu({ sdk, className }: { sdk: Sdk; className?: string }) {
  const docs = Object.fromEntries(
    SDKS.map((s) => [s, listDocs(s).map((slug) => slug.join('/'))]),
  ) as Record<Sdk, string[]>;

  return (
    <nav
      aria-label="Docs"
      className={[styles.menu, className].filter(Boolean).join(' ')}
    >
      <SdkSwitcher sdk={sdk} docs={docs} />
      <SearchButton />
      {docsMenuSections(sdk).map((section) => {
        const List = section.ordered ? 'ol' : 'ul';
        return (
          <div key={section.title} className={styles.section}>
            <h2>{section.title}</h2>
            <List>
              {section.links.map((link, index) => (
                <li key={`${index}-${link.href}`}>
                  <MenuLink href={link.href} activeClassName={styles.active}>
                    {link.text}
                  </MenuLink>
                </li>
              ))}
            </List>
          </div>
        );
      })}
    </nav>
  );
}
