'use client';

import { useState } from 'react';
import { CopyIcon } from './icons';

/** Copies the text of the enclosing code example's content to the clipboard. */
export function CopyButton() {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy code to clipboard"
      onClick={async (event) => {
        const content = event.currentTarget
          .closest('[data-component="code-example"]')
          ?.querySelector('[data-content]');
        try {
          await navigator.clipboard.writeText(content?.textContent ?? '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          console.error('Copy failed', err);
        }
      }}
    >
      {copied ? 'copied' : <CopyIcon />}
    </button>
  );
}
