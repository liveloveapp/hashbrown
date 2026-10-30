import type { SqlExecutor } from '../growth.ts';
import { decryptCredentials, encryptCredentials } from './crypto.ts';

/** The channels whose tokens are stored; dev.to uses a static API key. */
type StoredChannel = 'x' | 'linkedin';

/** The tokens for one channel. */
export interface ChannelCredentials {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp the access token stops working. */
  expiresAt?: string;
}

/** Encrypted channel tokens in `marketing_channel_credentials`. */
export interface CredentialStore {
  get(channel: StoredChannel): Promise<ChannelCredentials | undefined>;
  put(channel: StoredChannel, credentials: ChannelCredentials): Promise<void>;
  /**
   * Channels whose token expires on or before `now` plus `days`. X is never
   * returned: its stored access token is short-lived and refreshed on demand,
   * and its refresh token has no expiry, so an `x` row's `expires_at` (null
   * since tokens stopped recording it, but possibly set on older rows) says
   * nothing about needing to re-authorize.
   */
  expiringWithin(
    now: Date,
    days: number,
  ): Promise<Array<{ channel: StoredChannel; expiresAt: string }>>;
}

/**
 * Creates a store that encrypts every token with `key` before it reaches the
 * database.
 *
 * @param key - Base64 of 32 bytes (`MARKETING_CREDENTIALS_KEY`).
 */
export function createCredentialStore(
  executor: SqlExecutor,
  key: string,
): CredentialStore {
  return {
    async get(channel) {
      const { rows } = await executor.execute<{ ciphertext: string }>(
        'SELECT ciphertext FROM marketing_channel_credentials WHERE channel = $1',
        [channel],
      );
      return rows[0] ? decryptCredentials(rows[0].ciphertext, key) : undefined;
    },

    async put(channel, credentials) {
      await executor.execute(
        `INSERT INTO marketing_channel_credentials (channel, ciphertext, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (channel) DO UPDATE
         SET ciphertext = EXCLUDED.ciphertext, expires_at = EXCLUDED.expires_at`,
        [
          channel,
          encryptCredentials(credentials, key),
          credentials.expiresAt ?? null,
        ],
      );
    },

    async expiringWithin(now, days) {
      const cutoff = new Date(now.getTime() + days * 86_400_000);
      const { rows } = await executor.execute<{
        channel: StoredChannel;
        expires_at: Date | string;
      }>(
        `SELECT channel, expires_at FROM marketing_channel_credentials
         WHERE expires_at IS NOT NULL AND expires_at <= $1
         ORDER BY expires_at`,
        [cutoff.toISOString()],
      );
      return rows
        .filter((row) => row.channel !== 'x')
        .map((row) => ({
          channel: row.channel,
          expiresAt: new Date(row.expires_at).toISOString(),
        }));
    },
  };
}
