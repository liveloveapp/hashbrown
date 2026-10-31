import { expect, test } from 'vitest';
import { WeekImport } from './schema.ts';
import { createAdapters } from '../channels/registry.ts';
import { createMemoryCredentialStore } from '../credentials/memory-store.ts';

const week = (channel: 'x' | 'linkedin') => ({
  weekStart: '2026-11-02',
  researchBrief: {},
  posts: [
    {
      key: 'one',
      channel,
      kind: 'guide',
      scheduledAt: '2026-11-02T10:00:00-05:00',
      draft: { channel, text: 'A useful example.' },
      sources: [{ url: 'https://hashbrown.dev', note: 'source' }],
    },
  ],
});

test.each(['x', 'linkedin'] as const)(
  'week import refuses an image-free %s post',
  (channel) => {
    const result = WeekImport.safeParse(week(channel));

    expect(result.success).toBe(false);
  },
);

test.each(['x', 'linkedin'] as const)(
  'dispatch refuses an old text-only %s draft even in dry run',
  async (channel) => {
    const adapters = createAdapters({
      credentials: createMemoryCredentialStore(),
      env: {},
      dryRun: true,
    });

    await expect(
      adapters[channel].post({ channel, text: 'A useful example.' }),
    ).rejects.toThrow(/image/i);
  },
);
