'use client';

import { useSiteConfig } from '../use-site-config';
import { copyText } from './copy-text';
import { agentPrompt } from './home.content';
import { showSuccessToast } from './toast';

/**
 * Copies the coding-agent prompt for the selected framework and confirms
 * with a toast.
 *
 * @param props.className - Classes for the button (the hero uses `hb-btn`).
 */
export function CopyPromptButton({ className }: { className?: string }) {
  const { config } = useSiteConfig();

  const copy = async () => {
    if (
      await copyText(agentPrompt(config.sdk), globalThis.navigator?.clipboard)
    ) {
      showSuccessToast('Prompt copied. Paste it into your coding agent.');
    }
  };

  return (
    <button type="button" className={className} onClick={copy}>
      Copy agent prompt
    </button>
  );
}
