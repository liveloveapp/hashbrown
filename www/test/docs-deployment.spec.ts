import { expect, test } from 'vitest';
import {
  deploymentStatus,
  requireDeploymentOrigin,
  verifyPublishedDocs,
  waitForDocsRevision,
} from '../src/lib/docs-deployment';

const revision = 'a'.repeat(40);
const origin = 'https://hashbrown.dev';

test('accepts HTTPS origins and local verification, rejects credentials and remote HTTP', () => {
  const origins = [
    origin,
    'https://hashbrown-build.vercel.app',
    'http://127.0.0.1:4389',
  ];

  expect(origins.map(requireDeploymentOrigin)).toEqual(origins);
  for (const invalid of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?key=value',
    'file:///tmp/docs',
  ]) {
    expect(() => requireDeploymentOrigin(invalid)).toThrow();
  }
});

test('accepts the exact build revision from the existing static source bundle', async () => {
  const requests: string[] = [];
  const fetchRevision = async (url: string) => {
    requests.push(url);
    return Response.json({ commit: revision, files: [] });
  };

  const identity = await waitForDocsRevision({
    origin,
    expectedRevision: revision,
    fetchRevision,
    attempts: 1,
  });

  expect(identity).toEqual({ origin, revision });
  expect(requests).toEqual([`${origin}/workbench-source/react/generative-ui`]);
});

test('retries readiness propagation but rejects a stale or malformed revision at the bounded limit', async () => {
  let requests = 0;
  const waits: number[] = [];
  const fetchRevision = async () =>
    Response.json({ commit: ++requests === 1 ? 'b'.repeat(40) : revision });

  const identity = await waitForDocsRevision({
    origin,
    expectedRevision: revision,
    fetchRevision,
    attempts: 2,
    retryDelayMs: 5,
    wait: async (ms) => {
      waits.push(ms);
    },
  });

  expect(identity.revision).toBe(revision);
  expect(waits).toEqual([5]);
  for (const body of [
    { commit: 'b'.repeat(40) },
    { commit: revision.slice(0, 7) },
    {},
    { commit: null },
  ]) {
    await expect(
      waitForDocsRevision({
        origin,
        expectedRevision: revision,
        fetchRevision: async () => Response.json(body),
        attempts: 1,
      }),
    ).rejects.toThrow('Expected deployed revision');
  }
});

test('bounds hung requests and rejects redirects, failed responses, and invalid configuration', async () => {
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { location: 'https://example.com' },
    }),
    new Response(null, { status: 503 }),
  ]) {
    await expect(
      waitForDocsRevision({
        origin,
        expectedRevision: revision,
        fetchRevision: async () => response,
        attempts: 1,
      }),
    ).rejects.toThrow();
  }
  await expect(
    waitForDocsRevision({
      origin,
      expectedRevision: revision,
      fetchRevision: async () => new Promise<Response>(() => undefined),
      requestTimeoutMs: 10,
      attempts: 1,
    }),
  ).rejects.toThrow('timed out');
  await expect(
    waitForDocsRevision({ origin, expectedRevision: 'short', attempts: 1 }),
  ).rejects.toThrow('full');
  await expect(
    waitForDocsRevision({ origin, expectedRevision: revision, attempts: 0 }),
  ).rejects.toThrow('attempt');
});

test('production www success requires upload and verification, while previews and other targets preserve existing behavior', () => {
  const uploaded = {
    environment: 'production' as const,
    target: 'www',
    deploy: 'success',
    verification: 'success',
    cancelled: false,
  };

  expect(deploymentStatus(uploaded).state).toBe('success');
  expect(deploymentStatus({ ...uploaded, verification: 'failure' })).toEqual({
    state: 'failure',
    description:
      'Deployment uploaded; production documentation verification failed.',
  });
  expect(deploymentStatus({ ...uploaded, verification: '' }).state).toBe(
    'failure',
  );
  expect(deploymentStatus({ ...uploaded, deploy: 'failure' }).state).toBe(
    'failure',
  );
  expect(deploymentStatus({ ...uploaded, cancelled: true }).state).toBe(
    'error',
  );
  expect(
    deploymentStatus({
      ...uploaded,
      environment: 'preview',
      verification: 'skipped',
    }).state,
  ).toBe('success');
  expect(
    deploymentStatus({ ...uploaded, target: 'atc', verification: 'skipped' })
      .state,
  ).toBe('success');
});

test('checks immutable and public identities before and after exactly one browser audit', async () => {
  const requests: string[] = [];
  const audits: string[] = [];
  const immutableOrigin = 'https://hashbrown-build.vercel.app';

  const result = await verifyPublishedDocs({
    immutableOrigin,
    productionOrigin: origin,
    expectedRevision: revision,
    fetchRevision: async (url) => {
      requests.push(url);
      return Response.json({ commit: revision });
    },
    audit: async (url) => {
      audits.push(url);
    },
  });

  expect(result.passed).toBe(true);
  expect(audits).toEqual([origin]);
  expect(requests).toEqual(
    [immutableOrigin, origin, immutableOrigin, origin].map(
      (url) => `${url}/workbench-source/react/generative-ui`,
    ),
  );
});

test('fails promotion races and browser failures without retrying the browser until green', async () => {
  let promoted = false;
  let audits = 0;
  const options = {
    immutableOrigin: 'https://hashbrown-build.vercel.app',
    productionOrigin: origin,
    expectedRevision: revision,
    fetchRevision: async (url: string) =>
      Response.json({
        commit: promoted && url.startsWith(origin) ? 'b'.repeat(40) : revision,
      }),
  };

  await expect(
    verifyPublishedDocs({
      ...options,
      audit: async () => {
        audits++;
        promoted = true;
      },
    }),
  ).rejects.toThrow('Expected deployed revision');
  expect(audits).toBe(1);

  promoted = false;
  audits = 0;
  await expect(
    verifyPublishedDocs({
      ...options,
      audit: async () => {
        audits++;
        throw new Error('clipped label');
      },
    }),
  ).rejects.toThrow('clipped label');
  expect(audits).toBe(1);
});
