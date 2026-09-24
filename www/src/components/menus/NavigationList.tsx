'use client';

import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { MenuLink } from './MenuLink';
import type { NavigationItem, Section } from './menu.models';
import styles from './NavigationList.module.css';

/**
 * A drill-down navigation list, ported from the Angular `NavigationList`.
 * Sections render as buttons; an active section shows its children beside a
 * back button, and its siblings hide.
 */
export function NavigationList({
  sections,
  onChange,
}: {
  sections: readonly NavigationItem[];
  /** Called with the section whose button was clicked. */
  onChange?: (section: Section) => void;
}) {
  const hasActive = sections.some(
    (item) => item.kind === 'section' && item.active,
  );

  return (
    <ul
      className={[styles.navigationList, hasActive && styles.hasActive]
        .filter(Boolean)
        .join(' ')}
    >
      {sections.map((item, index) => {
        switch (item.kind) {
          case 'section':
            return (
              <li
                key={index}
                className={[styles.section, item.active && styles.active]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button type="button" onClick={() => onChange?.(item)}>
                  {item.title}
                  <ChevronRightIcon />
                </button>
                {item.active && (
                  <div className={styles.children}>
                    <button type="button" onClick={() => onChange?.(item)}>
                      <ChevronLeftIcon />
                      {item.title}
                    </button>
                    <NavigationList sections={item.children} />
                  </div>
                )}
              </li>
            );
          case 'link':
            return (
              <li key={index} className={styles.link}>
                <MenuLink href={item.url} exact>
                  {item.text}
                </MenuLink>
              </li>
            );
          case 'break':
            return <li key={index} className={styles.break} />;
        }
      })}
    </ul>
  );
}
