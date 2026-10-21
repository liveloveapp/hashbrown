'use client';

import { trackDocsCodeCopied } from '../lib/analytics/client';
import { docsFrameworkFromPath } from '../lib/analytics/events';
import { CopyIcon } from './icons';
import { toastService } from './toast/toast-service';

/** Track a successful docs copy; outside `/docs/<sdk>/…` nothing is sent. */
function trackCopy(language: string) {
  const pathname = window.location.pathname;
  const framework = docsFrameworkFromPath(pathname);
  if (framework) {
    trackDocsCodeCopied({ pathname, framework, language });
  }
}

/**
 * Copies the text of the enclosing code example's content to the clipboard
 * and confirms with a toast, like the Angular `CodeExample.onCopy`. A
 * successful copy on a framework docs page tracks `docs:code_copied` (never
 * the code itself).
 *
 * @param props.language - The code block's fence language, when known.
 */
export function CopyButton({ language }: { language?: string }) {
  return (
    <button
      type="button"
      aria-label="Copy code to clipboard"
      onClick={async (event) => {
        const example = event.currentTarget.closest(
          '[data-component="code-example"]',
        );
        const text =
          example?.querySelector('[data-content]')?.textContent ?? '';
        const resolvedLanguage =
          language ??
          example
            ?.querySelector('pre[data-language]')
            ?.getAttribute('data-language') ??
          'unknown';
        if (!text) {
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
        } catch (err) {
          console.error('Copy failed', err);
          return;
        }
        trackCopy(resolvedLanguage);
        toastService.success('Code copied to clipboard', {
          position: 'top-center',
        });
      }}
    >
      <CopyIcon />
    </button>
  );
}
