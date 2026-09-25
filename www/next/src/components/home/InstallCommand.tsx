'use client';

import { useRef } from 'react';
import { toastService } from '../toast/toast-service';
import { useSiteConfig } from '../use-site-config';
import { copyText } from './copy-text';
import { installCommand, type Sdk, SDK_LABELS } from './home.content';
import styles from './InstallCommand.module.css';

/** The frameworks in the order the toggle shows them. */
const SDKS: readonly Sdk[] = ['angular', 'react'];

/**
 * Split the install command after the npm scope, so narrow screens wrap
 * there instead of mid-package.
 *
 * @param command - The full install command.
 * @returns The command before and after the split point.
 */
export function splitInstallCommand(command: string): [string, string] {
  const split = command.indexOf('/') + 1;
  return [command.slice(0, split), command.slice(split)];
}

/**
 * The framework an arrow key moves to from `current`, following the
 * radio-group roving-tabindex pattern and wrapping at either end.
 *
 * @param current - The framework whose radio received the key.
 * @param key - The `KeyboardEvent.key`.
 * @returns The next framework, or `undefined` for keys the group ignores.
 */
export function sdkForKey(current: Sdk, key: string): Sdk | undefined {
  const forward = key === 'ArrowRight' || key === 'ArrowDown';
  const backward = key === 'ArrowLeft' || key === 'ArrowUp';
  if (!forward && !backward) {
    return undefined;
  }
  const delta = forward ? 1 : -1;
  return SDKS[(SDKS.indexOf(current) + delta + SDKS.length) % SDKS.length];
}

/**
 * The framework toggle and the matching `npm i` command with a copy button.
 * Selecting a framework updates the stored site preference, which switches
 * every framework-specific sample and link on the page.
 *
 * @param props.centered - Center the tabs and command (used by the closing CTA).
 */
export function InstallCommand({ centered = false }: { centered?: boolean }) {
  const { config, update } = useSiteConfig();
  const radios = useRef<Partial<Record<Sdk, HTMLButtonElement | null>>>({});
  const sdk = config.sdk;
  const command = installCommand(sdk);
  const [scope, packages] = splitInstallCommand(command);

  const copy = async () => {
    if (await copyText(command, globalThis.navigator?.clipboard)) {
      toastService.success('Install command copied', {
        position: 'top-center',
      });
    }
  };

  return (
    <div
      className={
        centered ? `${styles.install} ${styles.centered}` : styles.install
      }
    >
      <div className={styles.tabs} role="radiogroup" aria-label="Framework">
        {SDKS.map((option) => (
          <button
            key={option}
            ref={(button) => {
              radios.current[option] = button;
            }}
            type="button"
            role="radio"
            aria-checked={sdk === option}
            tabIndex={sdk === option ? 0 : -1}
            className={sdk === option ? styles.on : undefined}
            onClick={() => update({ sdk: option })}
            onKeyDown={(event) => {
              const next = sdkForKey(option, event.key);
              if (!next) {
                return;
              }
              event.preventDefault();
              update({ sdk: next });
              radios.current[next]?.focus();
            }}
          >
            {SDK_LABELS[option]}
          </button>
        ))}
      </div>
      <div className={styles.command}>
        <code>
          {scope}
          <wbr />
          {packages}
        </code>
        <button
          type="button"
          className={styles.copy}
          onClick={copy}
          aria-label="Copy install command"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
