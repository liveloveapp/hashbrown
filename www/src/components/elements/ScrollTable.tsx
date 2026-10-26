'use client';

import {
  type ComponentPropsWithoutRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './ScrollTable.module.css';

/** A horizontal scroller's position and sizes. */
export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** Which edges of a horizontal scroller hide more content. */
export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

/**
 * Work out which edges of a horizontal scroller have content past them.
 *
 * @param metrics - The scroller's position and sizes.
 * @returns `start` when scrolled away from the start, `end` when more remains
 *   at the end. Both allow a pixel for sub-pixel rounding.
 */
export function scrollEdges(metrics: ScrollMetrics): ScrollEdges {
  const maxScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  return {
    start: metrics.scrollLeft > 1,
    end: metrics.scrollLeft < maxScroll - 1,
  };
}

const NO_EDGES: ScrollEdges = { start: false, end: false };

/**
 * A markdown `<table>` that scrolls horizontally inside its own frame, with a
 * shadow on each edge that has more columns past it.
 */
export function ScrollTable(props: ComponentPropsWithoutRef<'table'>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const next = scrollEdges(el);
      setEdges((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      );
    };

    const resizeObserver =
      'ResizeObserver' in window ? new ResizeObserver(update) : undefined;
    resizeObserver?.observe(el);
    // The table can widen without the scroller resizing, as when fonts load.
    if (el.firstElementChild) {
      resizeObserver?.observe(el.firstElementChild);
    }
    el.addEventListener('scroll', update, { passive: true });
    // Let layout settle before the first measurement.
    const frame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div
      className={styles.frame}
      data-scroll-table=""
      data-overflow-start={edges.start ? '' : undefined}
      data-overflow-end={edges.end ? '' : undefined}
    >
      <div className={styles.scroller} ref={scrollerRef}>
        <table {...props} />
      </div>
    </div>
  );
}
