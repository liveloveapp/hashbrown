'use client';

import { useState } from 'react';
import styles from './ApiMenu.module.css';
import { type Section, toggleSection } from './menu.models';
import { NavigationList } from './NavigationList';

/**
 * The sliding window of the API menu: opening a package slides its symbol
 * list into view, closing it slides back to the package list.
 */
export function ApiMenuWindow({
  sections: initialSections,
}: {
  sections: Section[];
}) {
  const [sections, setSections] = useState(initialSections);
  const level = sections.some((section) => section.active) ? 1 : 0;

  return (
    <div
      className={[styles.window, level === 1 && styles.level1]
        .filter(Boolean)
        .join(' ')}
    >
      <NavigationList
        sections={sections}
        onChange={(section) =>
          setSections((current) => toggleSection(current, section.title))
        }
      />
    </div>
  );
}
