'use client';

import {
  type ReactNode,
  type ToggleEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import styles from './DropdownMenu.module.css';

function placePanel(
  trigger: HTMLElement | null,
  panel: HTMLElement | null,
  offsetY: number,
): void {
  if (!trigger || !panel) {
    return;
  }
  const rect = trigger.getBoundingClientRect();
  panel.style.top = `${rect.bottom + offsetY}px`;
  panel.style.left = `${rect.left}px`;
}

/**
 * A click-to-open dropdown menu, ported from the Angular `DropdownMenu`.
 *
 * The panel is a native `popover="auto"`, so it renders in the top layer
 * (escaping the menu's `overflow`, like the CDK overlay did) and closes on an
 * outside click and on Escape without extra code. It opens below the trigger,
 * aligned to its start edge, `offsetY` pixels down, and closes when an item
 * inside it is clicked.
 */
export function DropdownMenu({
  label,
  children,
  triggerClassName,
  offsetY = 4,
}: {
  /** Contents of the trigger button. */
  label: ReactNode;
  /** Contents of the panel. */
  children: ReactNode;
  triggerClassName?: string;
  offsetY?: number;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Follow the trigger while open, as the CDK's reposition strategy did.
  useEffect(() => {
    if (!open) {
      return;
    }
    const place = () =>
      placePanel(triggerRef.current, panelRef.current, offsetY);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, offsetY]);

  return (
    <div className={styles.host}>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(' ')}
        popoverTarget={menuId}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {label}
      </button>
      <div
        ref={panelRef}
        id={menuId}
        popover="auto"
        role="menu"
        tabIndex={-1}
        className={styles.panel}
        onBeforeToggle={(event: ToggleEvent<HTMLDivElement>) => {
          if (event.newState === 'open') {
            placePanel(triggerRef.current, event.currentTarget, offsetY);
          }
        }}
        onToggle={(event: ToggleEvent<HTMLDivElement>) =>
          setOpen(event.newState === 'open')
        }
        onClick={() => panelRef.current?.hidePopover()}
      >
        {children}
      </div>
    </div>
  );
}
