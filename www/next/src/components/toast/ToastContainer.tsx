'use client';

import type { Toast, ToastPosition } from './toast-service';
import { toastService, useToasts } from './toast-service';
import styles from './Toast.module.css';

/** The positions in the order the Angular container rendered them. */
const POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/**
 * One toast: icon, message and close button, sliding in from its edge. Port of
 * `www/analog/src/app/components/ToastItem.ts`.
 *
 * @param props.toast - The toast to show.
 */
export function ToastItem({ toast }: { toast: Toast }) {
  const position = toast.position ?? 'top-right';

  return (
    <div className={`${styles.item} ${styles[position]}`}>
      <div
        className={`${styles.toast} ${styles[toast.type]}`}
        role="alert"
        aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
        data-type={toast.type}
      >
        {toast.icon ? <div className={styles.icon}>{toast.icon}</div> : null}
        <div className={styles.message} data-message="">
          {toast.message}
        </div>
        {toast.dismissible ? (
          <button
            className={styles.close}
            onClick={() => toastService.dismiss(toast.id)}
            aria-label="Dismiss notification"
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The site-wide toast outlet, mounted once by the root layout. Groups the
 * active toasts by position. Port of
 * `www/analog/src/app/components/ToastContainer.ts`.
 */
export function ToastContainer() {
  const toasts = useToasts();

  return (
    <div className={styles.container}>
      {POSITIONS.map((position) => {
        const here = toasts.filter((toast) => toast.position === position);
        if (here.length === 0) {
          return null;
        }
        return (
          <div
            key={position}
            className={`${styles.position} ${styles[position]}`}
            data-position={position}
          >
            {here.map((toast) => (
              <ToastItem key={toast.id} toast={toast} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
