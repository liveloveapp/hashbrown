import { expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../credentials/memory-store.ts';
import { createAdapters } from './registry.ts';
import type { Draft, SocialChannel } from './types.ts';

const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A reviewed example.',
  sha256: 'a'.repeat(64),
};

const drafts: Record<SocialChannel, Draft> = {
  x: { channel: 'x', image, text: 'hello' },
  linkedin: { channel: 'linkedin', image, text: 'hello' },
  devto: {
    channel: 'devto',
    text: 'body',
    article: { title: 'Title' },
  },
};

test.each(['x', 'linkedin', 'devto'] as const)(
  'a dry run on %s makes no fetch call, needs no credentials and returns a fake result',
  async (channel) => {
    const fetchMock = vi.fn();
    const adapters = createAdapters({
      credentials: createMemoryCredentialStore(),
      env: {},
      fetch: fetchMock,
      dryRun: true,
    });

    const result = await adapters[channel].post(drafts[channel]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.channel).toBe(channel);
    expect(result.postId).toMatch(/^dry-run-.+/);
    expect(result.url).toBe(`dry-run://${channel}/${result.postId}`);
  },
);

test('a dry run still rejects an invalid draft', async () => {
  const adapters = createAdapters({
    credentials: createMemoryCredentialStore(),
    env: {},
    dryRun: true,
  });

  await expect(
    adapters.x.post({ channel: 'x', image, text: 'a'.repeat(281) }),
  ).rejects.toThrow(/280/);
});

test('an adapter rejects a draft for another channel', async () => {
  const adapters = createAdapters({
    credentials: createMemoryCredentialStore(),
    env: {},
    dryRun: true,
  });

  await expect(adapters.x.post(drafts.linkedin)).rejects.toThrow(
    /Channel mismatch/,
  );
});

test('a live post without the static env config names the missing variables', async () => {
  const adapters = createAdapters({
    credentials: createMemoryCredentialStore(),
    env: {},
    dryRun: false,
    fetch: vi.fn(),
  });

  await expect(adapters.x.post(drafts.x)).rejects.toThrow(
    /X_CLIENT_ID, X_CLIENT_SECRET/,
  );
  await expect(adapters.linkedin.post(drafts.linkedin)).rejects.toThrow(
    /LINKEDIN_AUTHOR_URN/,
  );
  await expect(adapters.devto.post(drafts.devto)).rejects.toThrow(
    /DEVTO_API_KEY/,
  );
});

test('a live post without a stored credential names the channel and the auth CLI', async () => {
  const fetchMock = vi.fn();
  const adapters = createAdapters({
    credentials: createMemoryCredentialStore(),
    env: {
      X_CLIENT_ID: 'cid',
      X_CLIENT_SECRET: 'csec',
      LINKEDIN_AUTHOR_URN: 'urn:li:person:abc',
    },
    dryRun: false,
    fetch: fetchMock,
  });

  await expect(adapters.x.post(drafts.x)).rejects.toThrow(
    /nx run marketing:x-auth/,
  );
  await expect(adapters.linkedin.post(drafts.linkedin)).rejects.toThrow(
    /nx run marketing:linkedin-auth/,
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
