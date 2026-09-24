'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { CloseIcon, MenuIcon } from './icons';
import type { Sdk } from './links';
import { SdkLink } from './SdkLink';
import styles from './MobileMenu.module.css';

/** Which menu the mobile menu shows. */
export type MobileMenuTab = 'docs' | 'api';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The open mobile menu: a fullscreen panel with the docs/api switcher, the
 * selected menu, and links to examples, blog and quick start. Ports the
 * `.fullscreen` content of the Angular header's `FullscreenMenu`.
 */
export function MobileMenuPanel({
  id,
  sdk,
  tab,
  onTabChange,
  onClose,
  docsMenu,
  apiMenu,
  closeButtonRef,
}: {
  id: string;
  sdk?: Sdk;
  tab: MobileMenuTab;
  onTabChange: (tab: MobileMenuTab) => void;
  onClose: () => void;
  docsMenu?: ReactNode;
  apiMenu?: ReactNode;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      id={id}
      className={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      tabIndex={-1}
      onKeyDown={trapFocus}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className={styles.close}
        aria-label="Close menu"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
      <div className={styles.fullscreen}>
        <div className={styles.header}>
          <Link href="/" onClick={onClose}>
            <img src="/image/logo/word-mark.svg" alt="hashbrown" height={24} />
          </Link>
        </div>
        <div className={styles.content}>
          <div className={styles.actions}>
            {(['docs', 'api'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={tab === value ? styles.active : undefined}
                aria-pressed={tab === value}
                onClick={() => onTabChange(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div
            className={`${styles.menu} ${tab === 'docs' ? styles.active : ''}`}
          >
            {docsMenu}
          </div>
          <div
            className={`${styles.menu} ${tab === 'api' ? styles.active : ''}`}
          >
            {apiMenu}
          </div>
          <div className={styles.footer}>
            <Link href="/samples" onClick={onClose}>
              examples
            </Link>
            <Link href="/blog" onClick={onClose}>
              blog
            </Link>
            <SdkLink to="quick-start" sdk={sdk} onClick={onClose}>
              quick start
            </SdkLink>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The header's mobile menu: a button that opens a fullscreen panel. Escape,
 * the close button, the panel's links and any navigation close it; the page
 * doesn't scroll while it is open, focus moves into the panel on open, stays
 * inside it, and returns to the button on close.
 */
export function MobileMenu({
  sdk,
  docsMenu,
  apiMenu,
}: {
  sdk?: Sdk;
  docsMenu?: ReactNode;
  apiMenu?: ReactNode;
}) {
  const id = useId();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<MobileMenuTab>('docs');
  const [openedAt, setOpenedAt] = useState(pathname);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation, like the Angular menu's NavigationEnd subscription.
  if (open && pathname !== openedAt) {
    setOpen(false);
  }

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    setOpenedAt(pathname);
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    closeButtonRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <MenuIcon />
      </button>
      {open && (
        <MobileMenuPanel
          id={id}
          sdk={sdk}
          tab={tab}
          onTabChange={setTab}
          onClose={close}
          docsMenu={docsMenu}
          apiMenu={apiMenu}
          closeButtonRef={closeButtonRef}
        />
      )}
    </div>
  );
}
