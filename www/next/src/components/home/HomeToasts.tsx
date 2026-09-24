'use client';

import { dismissToast, useToasts } from './toast';
import styles from './HomeToasts.module.css';

/**
 * The homepage's toast outlet: success toasts at the top center, a port of
 * the Angular `www-toast-container` for the only toasts the homepage shows.
 */
export function HomeToasts() {
  const toasts = useToasts();

  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className={styles.container}>
      <div className={styles.position}>
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.item}>
            <div className={styles.toast} role="alert" aria-live="polite">
              <div className={styles.message}>{toast.message}</div>
              <button
                className={styles.close}
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                type="button"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
