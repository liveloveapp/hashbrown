import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './NextSteps.module.css';

/** `<hb-next-steps>`: a list of next-step cards. */
export function NextSteps({ children }: { children?: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

/**
 * Resolve a next-step link. Relative links are relative to the SDK's docs
 * root, matching the Angular `NextStep` component.
 *
 * @param link - The `link` attribute as written in markdown.
 * @param sdk - The SDK whose docs the page belongs to.
 */
export function resolveStepLink(link: string | undefined, sdk: string): string {
  if (!link) {
    return '#';
  }
  return link.startsWith('/') || /^https?:/.test(link)
    ? link
    : `/docs/${sdk}/${link}`;
}

/** `<hb-next-step link>`: one linked card. */
export function NextStep({
  link,
  sdk,
  children,
}: {
  link?: string;
  sdk: string;
  children?: ReactNode;
}) {
  return (
    <li className={styles.step} data-component="next-step">
      <Link href={resolveStepLink(link, sdk)}>{children}</Link>
    </li>
  );
}
