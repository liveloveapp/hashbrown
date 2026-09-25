'use client';

import { CopyIcon } from './icons';
import { toastService } from './toast/toast-service';

/**
 * Copies the text of the enclosing code example's content to the clipboard
 * and confirms with a toast, like the Angular `CodeExample.onCopy`.
 */
export function CopyButton() {
  return (
    <button
      type="button"
      aria-label="Copy code to clipboard"
      onClick={async (event) => {
        const text =
          event.currentTarget
            .closest('[data-component="code-example"]')
            ?.querySelector('[data-content]')?.textContent ?? '';
        if (!text) {
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          toastService.success('Code copied to clipboard', {
            position: 'top-center',
          });
        } catch (err) {
          console.error('Copy failed', err);
        }
      }}
    >
      <CopyIcon />
    </button>
  );
}
