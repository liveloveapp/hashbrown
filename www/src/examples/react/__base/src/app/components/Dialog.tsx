'use client';
import { type ReactNode, useCallback, useEffect } from 'react';
import X from '../icons/X';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Dialog({
  open,
  onClose,
  title,
  children,
}: DialogProps) {
  if (!open) return null;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className={styles.backdrop} onClick={() => onClose()}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          {title && <div className={styles.title}>{title}</div>}
          <button
            className={styles.close}
            onClick={() => onClose()}
            aria-label="Close"
          >
            <X />
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
