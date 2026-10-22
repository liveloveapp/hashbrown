import { type EmailHmacKeyring, parseEmailHmacKeyring } from './growth.ts';

/**
 * Loads the email HMAC keyring the collectors use. Called lazily, so a tick
 * with hello activation and the digest switched off never needs identity
 * credentials.
 *
 * @param environment - Environment to read; defaults to `process.env`.
 * @throws When the active key is missing or too short, or versions repeat.
 */
export function loadEmailHmacKeyring(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EmailHmacKeyring {
  return parseEmailHmacKeyring(environment);
}
