import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { codeToHtml } from 'shiki';
import styles from './CodeModal.module.css';

interface CodeModalProps {
  code: string;
  onClose: () => void;
}

export const CodeModal = ({ code, onClose }: CodeModalProps) => {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    let isActive = true;
    codeToHtml(code, {
      lang: 'javascript',
      theme: 'min-dark',
    }).then((result) => {
      if (isActive) {
        setHtml(result);
      }
    });

    return () => {
      isActive = false;
    };
  }, [code]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const { body } = document;
    const originalOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = originalOverflow;
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close code preview"
          onClick={onClose}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>,
    document.body,
  );
};
