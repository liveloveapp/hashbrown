import styles from './ApiMenu.module.css';
import { apiMenuSections } from './api-menu.data';
import { ApiMenuWindow } from './ApiMenuWindow';

/**
 * The API reference side menu: every symbol in `api-report.min.json`,
 * grouped by package. Ported from the Angular `ApiMenu`.
 *
 * @param props.className - Extra classes for the root, e.g. layout rules.
 */
export function ApiMenu({ className }: { className?: string } = {}) {
  return (
    <nav
      aria-label="API reference"
      className={[styles.menu, className].filter(Boolean).join(' ')}
    >
      <ApiMenuWindow sections={apiMenuSections()} />
    </nav>
  );
}
