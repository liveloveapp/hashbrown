'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Sdk } from '../../lib/content';
import styles from './DocsMenu.module.css';
import { DropdownMenu } from './DropdownMenu';
import { ChevronDownIcon } from '../icons';
import { AngularIcon, ReactIcon } from './icons';
import { sdkSwitchHref } from './sdk-switch';

const brown = '#774625';

/**
 * The docs menu's SDK dropdown. Each option links to the current page in
 * that SDK, or to its intro when the page doesn't exist there.
 */
export function SdkSwitcher({
  sdk,
  docs,
}: {
  sdk: Sdk;
  /** Every docs page per SDK, as slug paths like `start/quick`. */
  docs: Record<Sdk, readonly string[]>;
}) {
  const pathname = usePathname();

  return (
    <div className={styles.sdk}>
      <DropdownMenu
        offsetY={8}
        triggerClassName={styles.sdkTrigger}
        label={
          <label>
            <span>
              {sdk === 'angular' ? (
                <AngularIcon height="16px" width="16px" fill={brown} />
              ) : (
                <ReactIcon height="16px" width="16px" fill={brown} />
              )}
              {sdk === 'angular' ? 'Angular' : 'React'}
            </span>
            <ChevronDownIcon height="16px" width="16px" />
          </label>
        }
      >
        <div className={styles.dropdownContent}>
          <Link
            href={sdkSwitchHref(pathname, 'angular', docs.angular)}
            className={styles.menuItem}
            role="menuitem"
          >
            <AngularIcon height="16px" width="16px" fill={brown} />
            Angular
          </Link>
          <Link
            href={sdkSwitchHref(pathname, 'react', docs.react)}
            className={styles.menuItem}
            role="menuitem"
          >
            <ReactIcon height="16px" width="16px" fill={brown} />
            React
          </Link>
        </div>
      </DropdownMenu>
    </div>
  );
}
