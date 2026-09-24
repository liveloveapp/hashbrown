'use client';

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './SymbolPopover.module.css';

/** Delays from the Angular `SymbolLink` hover registration. */
const HOVER_DELAY_MS = 250;
const CLOSE_DELAY_MS = 200;
const OFFSET = 8;

/** Props of {@link SymbolPopover}. */
export interface SymbolPopoverProps {
  /** The symbol's canonical reference; marks the trigger for tests and tooling. */
  reference: string;
  /** Server-rendered popover body (header, summary and API). */
  content: ReactNode;
  /** The link that opens the popover on hover. */
  children: ReactNode;
}

/**
 * Place the popover above its origin, centered, or below it when there isn't
 * room above; keep it inside the viewport horizontally. Mirrors the CDK
 * connected positions the Angular `PopoverService` preferred.
 */
function place(popover: HTMLElement, origin: DOMRect) {
  const { width, height } = popover.getBoundingClientRect();
  const above = origin.top - OFFSET - height;
  const top = above >= 0 ? above : origin.bottom + OFFSET;
  const centered = origin.left + origin.width / 2 - width / 2;
  const left = Math.max(0, Math.min(centered, window.innerWidth - width));
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.visibility = 'visible';
}

/**
 * Shows a symbol's summary when its link is hovered: opens after 250ms, stays
 * open while the pointer is over the link or the popover, and closes 200ms
 * after leaving both (or on scroll). The content arrives as props, so nothing
 * is fetched at runtime. Port of the hover popover in Angular's `SymbolLink`.
 */
export function SymbolPopover({
  reference,
  content,
  children,
}: SymbolPopoverProps) {
  const [open, setOpen] = useState(false);
  const originRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const hovering = useRef({ origin: false, popover: false });

  const closeIfLeft = () => {
    if (!hovering.current.origin && !hovering.current.popover) {
      setOpen(false);
    }
  };

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  useLayoutEffect(() => {
    if (open && popoverRef.current && originRef.current) {
      place(popoverRef.current, originRef.current.getBoundingClientRect());
    }
  }, [open]);

  return (
    <span
      ref={originRef}
      className={styles.origin}
      data-symbol-popover={reference}
      onMouseEnter={() => {
        hovering.current.origin = true;
        if (open) {
          return;
        }
        window.clearTimeout(openTimer.current);
        openTimer.current = window.setTimeout(() => {
          if (hovering.current.origin) {
            setOpen(true);
          }
        }, HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        hovering.current.origin = false;
        window.clearTimeout(openTimer.current);
        window.setTimeout(closeIfLeft, CLOSE_DELAY_MS);
      }}
    >
      {children}
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className={styles.overlay}
              role="tooltip"
              onMouseEnter={() => {
                hovering.current.popover = true;
              }}
              onMouseLeave={() => {
                hovering.current.popover = false;
                window.setTimeout(closeIfLeft, 0);
              }}
            >
              <div className={styles.popover}>
                <div className={styles.content}>{content}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
