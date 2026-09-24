'use client';

import {
  type CSSProperties,
  type ReactNode,
  type SVGProps,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './Carousel.module.css';

/** Props of `<hb-carousel>`; attribute values arrive as strings. */
export interface CarouselProps {
  /** Overrides the `--columns` CSS variable (layout on small screens and page size). */
  columns?: string;
  /** The slides, usually `<img>` elements. */
  children?: ReactNode;
}

interface Metrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const EMPTY_METRICS: Metrics = {
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
};

/**
 * Parse the `columns` attribute into a CSS value.
 *
 * @param value - The raw attribute.
 * @returns The column count as a string, or `null` when missing or not positive.
 */
export function columnsStyle(value: string | undefined): string | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

const Chevron = ({ d, ...p }: SVGProps<SVGSVGElement> & { d: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    height="16"
    width="16"
    {...p}
  >
    <path d={d} />
  </svg>
);

/**
 * `<hb-carousel columns>`: a horizontally scrolling, snap-aligned strip of
 * slides with previous/next buttons that page by the visible column count.
 * Keyboard support matches the Angular version: the paging buttons are native
 * buttons, and the scroller scrolls natively.
 */
export function Carousel({ columns, children }: CarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const cols = columnsStyle(columns);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const update = () =>
      setMetrics({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });

    const resizeObserver =
      'ResizeObserver' in window ? new ResizeObserver(update) : undefined;
    resizeObserver?.observe(el);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', update, { passive: true });
    // Let layout settle before the first measurement.
    const frame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  const canScrollLeft = metrics.scrollLeft > 0;
  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  // Allow for sub-pixel rounding.
  const canScrollRight = metrics.scrollLeft < maxScroll - 1;

  const page = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    const first = el?.firstElementChild;
    if (!el || !first) {
      return;
    }
    const itemWidth = first.getBoundingClientRect().width;
    const computed = getComputedStyle(el);
    const gap = parseFloat(computed.columnGap || '0') || 0;
    const columnCount =
      Number.parseFloat(computed.getPropertyValue('--columns').trim() || '1') ||
      1;
    const step = itemWidth * columnCount + gap * columnCount;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <div
      className={styles.host}
      style={cols ? ({ '--columns': cols } as CSSProperties) : undefined}
    >
      <div className={styles.carousel}>
        <div className={styles.scroller} ref={scrollerRef} data-scroller="">
          {children}
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => page(-1)}
          className={canScrollLeft ? styles.active : undefined}
          disabled={!canScrollLeft}
        >
          <Chevron d="M15 6l-6 6l6 6" />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => page(1)}
          className={canScrollRight ? styles.active : undefined}
          disabled={!canScrollRight}
        >
          <Chevron d="M9 6l6 6l-6 6" />
        </button>
      </div>
    </div>
  );
}
