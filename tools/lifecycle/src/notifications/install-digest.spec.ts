import { expect, test } from 'vitest';

import { renderInstallDigest } from './install-digest.ts';

const ORIGIN = 'https://hashbrown.dev';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    email: 'jordan@acme.dev',
    companyDomain: 'acme.dev',
    gitDisplayName: 'Jordan Lee',
    repositoryProvider: 'github',
    repositoryOwner: 'acme',
    gitConfigOrigin: 'local' as const,
    packages: [{ packageName: '@hashbrownai/core', packageVersion: '0.8.0' }],
    installCount: 3,
    firstSeenAt: new Date('2026-10-20T01:00:00.000Z'),
    lastSeenAt: new Date('2026-10-21T02:00:00.000Z'),
    framework: 'react' as const,
    highestMilestone: 'streamed' as const,
    scoreTier: 'high' as const,
    approveToken: 'tok_1.abc-def',
    ...overrides,
  };
}

const context = {
  since: new Date('2026-10-20T00:00:00.000Z'),
  anonymousInstallSubjects: 4,
  ciInstallSubjects: 2,
};

test('install digest renders framework, highest milestone, score tier and one approve URL per identity under the given origin', () => {
  const digest = renderInstallDigest({
    businessDate: '2026-10-21',
    publicActionOrigin: ORIGIN,
    candidates: [
      candidate(),
      candidate({
        email: 'sam@beta.io',
        companyDomain: 'beta.io',
        gitDisplayName: null,
        framework: null,
        highestMilestone: 'installed',
        scoreTier: 'low',
        approveToken: 'tok_2',
      }),
    ],
    context,
  });

  expect(digest).toContain('Framework: react');
  expect(digest).toContain('Framework: unknown');
  expect(digest).toContain('Highest milestone: streamed');
  expect(digest).toContain('Score tier: high');
  expect(digest).toContain('Jordan Lee');
  expect(digest).toContain('Installs: 3, first 2026-10-20T01:00:00.000Z');
  expect(digest).toContain(
    `${ORIGIN}/_/growth/approve-install?token=tok_1.abc-def`,
  );
  expect(digest).toContain(`${ORIGIN}/_/growth/approve-install?token=tok_2`);
  expect(digest.match(/approve-install\?token=/gu)).toHaveLength(2);
  expect(digest).toContain(
    '4 install subjects without identity, 2 CI install subjects',
  );
});

test('install digest rejects an empty list, more than 200 candidates, an unsafe origin and an unsafe token', () => {
  const base = {
    businessDate: '2026-10-21',
    publicActionOrigin: ORIGIN,
    context,
  };

  expect(() => renderInstallDigest({ ...base, candidates: [] })).toThrow();
  expect(() =>
    renderInstallDigest({
      ...base,
      candidates: Array.from({ length: 201 }, () => candidate()),
    }),
  ).toThrow();
  expect(() =>
    renderInstallDigest({
      ...base,
      publicActionOrigin: 'http://hashbrown.dev',
      candidates: [candidate()],
    }),
  ).toThrow();
  expect(() =>
    renderInstallDigest({
      ...base,
      candidates: [candidate({ approveToken: 'a&b=c' })],
    }),
  ).toThrow();
});

test('no template or subject contains the word tracking', async () => {
  const { renderCampaignTemplate } = await import('../campaign/templates.ts');
  const { renderFulfillmentTemplate } =
    await import('../fulfillment/templates.ts');
  const outputs = [
    ...(['immediate', 'day-3', 'day-8'] as const).map(renderCampaignTemplate),
    renderFulfillmentTemplate({ context: 'unstuck' }),
  ].flatMap((draft) => [draft.subject, draft.body]);
  const digest = renderInstallDigest({
    businessDate: '2026-10-21',
    publicActionOrigin: ORIGIN,
    candidates: [candidate()],
    context,
  });

  const all = [...outputs, digest].join('\n');

  expect(all).not.toMatch(/tracking/iu);
});
