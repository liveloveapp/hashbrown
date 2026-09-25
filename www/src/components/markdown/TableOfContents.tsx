'use client';

import { useEffect, useRef, useState } from 'react';
import type { Heading } from '../../lib/rehype-heading-ids';
import styles from './MarkdownPage.module.css';

/**
 * The on-page table of contents. Highlights the first fully visible heading
 * and fades out once the end of the article is on screen, like the Analog
 * `MarkdownPage` menu.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [faded, setFaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = new Set(
          entries.filter((e) => e.isIntersecting).map((e) => e.target.id),
        );
        const first = headings.find((heading) => visible.has(heading.id));
        if (first) {
          setActiveId(first.id);
        }
      },
      { threshold: 1 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setFaded(true);
      } else if (
        entry.rootBounds &&
        entry.boundingClientRect.top > entry.rootBounds.bottom
      ) {
        setFaded(false);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <menu className={faded ? `${styles.toc} ${styles.faded}` : styles.toc}>
        {headings.map((heading, index) => (
          <a
            key={`${heading.id}-${index}`}
            href={`#${heading.id}`}
            className={activeId === heading.id ? styles.active : undefined}
            style={{ paddingLeft: 24 + (heading.level - 2) * 8 }}
            onClick={(event) => {
              event.preventDefault();
              history.replaceState(null, '', `#${heading.id}`);
              document
                .getElementById(heading.id)
                ?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {heading.text}
          </a>
        ))}
      </menu>
      <div ref={sentinelRef} className={styles.sentinel} />
    </>
  );
}
