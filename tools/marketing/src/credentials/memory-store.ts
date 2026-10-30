import type { ChannelCredentials, CredentialStore } from './store.ts';

/**
 * A {@link CredentialStore} held in memory, for tests that need no database.
 * Like the real store, `expiringWithin` never returns X.
 */
export function createMemoryCredentialStore(
  initial: Partial<Record<'x' | 'linkedin', ChannelCredentials>> = {},
): CredentialStore {
  const entries = new Map<string, ChannelCredentials>(Object.entries(initial));
  return {
    async get(channel) {
      return entries.get(channel);
    },
    async put(channel, credentials) {
      entries.set(channel, credentials);
    },
    async expiringWithin(now, days) {
      const cutoff = now.getTime() + days * 86_400_000;
      return [...entries]
        .filter(
          ([channel, value]) =>
            channel !== 'x' &&
            value.expiresAt !== undefined &&
            new Date(value.expiresAt).getTime() <= cutoff,
        )
        .map(([channel, value]) => ({
          channel: channel as 'x' | 'linkedin',
          expiresAt: value.expiresAt as string,
        }));
    },
  };
}
