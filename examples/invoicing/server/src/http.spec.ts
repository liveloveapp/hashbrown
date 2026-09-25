import { createServer, type RequestListener } from 'node:http';
import { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { createInvoicingListener } from './http';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createMemoryRepositories } from './persistence/memory';

async function fixture(runReview?: RequestListener) {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const reviews = createReviewCoordinator(store, repositories.threads, {});
  const server = createServer(
    createInvoicingListener(store, reviews, runReview),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    store,
    reviews,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

test('snapshot assigns an opaque HTTP-only session cookie and reuses it', async () => {
  const app = await fixture();

  try {
    const first = await fetch(`${app.url}/api/snapshot`);
    const cookie = first.headers.get('set-cookie') ?? '';
    const second = await fetch(`${app.url}/api/snapshot`, {
      headers: { cookie: cookie.split(';')[0] },
    });

    expect(cookie).toMatch(
      /^invoicing_session=[0-9a-f-]+; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(second.headers.get('set-cookie')).toBeNull();
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get('cache-control')).toBe('no-store');
  } finally {
    await app.close();
  }
});

test('operation reads are scoped to the cookie session', async () => {
  const app = await fixture();
  const owner = await app.store.createSession();
  const other = await app.store.createSession();
  const proposal = await app.store.propose(owner, {
    paymentId: 'payment-001',
    lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }],
  });
  await app.store.decide(owner, { ...proposal, decision: 'approve' });

  try {
    const own = await fetch(
      `${app.url}/api/operations/${proposal.operationId}`,
      { headers: { cookie: `invoicing_session=${owner}` } },
    );
    const foreign = await fetch(
      `${app.url}/api/operations/${proposal.operationId}`,
      { headers: { cookie: `invoicing_session=${other}` } },
    );
    const snapshot = await fetch(`${app.url}/api/snapshot`, {
      headers: { cookie: `invoicing_session=${other}` },
    });

    expect(own.status).toBe(200);
    expect((await own.json()).status).toBe('approved');
    expect(foreign.status).toBe(404);
    expect((await snapshot.json()).allocations).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('read-only HTTP boundary rejects writes and malformed operation paths', async () => {
  const app = await fixture();

  try {
    const write = await fetch(`${app.url}/api/snapshot`, { method: 'POST' });
    const malformed = await fetch(`${app.url}/api/operations/%ZZ`);
    const missing = await fetch(`${app.url}/not-found`);

    expect(write.status).toBe(405);
    expect(write.headers.get('allow')).toBe('GET');
    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(404);
  } finally {
    await app.close();
  }
});

test('unknown and duplicate cookie identities cannot reuse an existing session', async () => {
  const app = await fixture();
  const owner = await app.store.createSession();

  try {
    const unknown = await fetch(`${app.url}/api/snapshot`, {
      headers: {
        cookie: 'invoicing_session=00000000-0000-0000-0000-000000000000',
      },
    });
    const duplicate = await fetch(`${app.url}/api/snapshot`, {
      headers: {
        cookie: `invoicing_session=${owner}; invoicing_session=${owner}`,
      },
    });

    expect(unknown.headers.get('set-cookie')).not.toContain(
      '=00000000-0000-0000-0000-000000000000;',
    );
    expect(duplicate.headers.get('set-cookie')).not.toContain(`=${owner};`);
    expect(unknown.status).toBe(200);
    expect(duplicate.status).toBe(200);
  } finally {
    await app.close();
  }
});

test('proposal reads return stored values only to their owning session', async () => {
  const app = await fixture();
  const owner = await app.store.createSession();
  const other = await app.store.createSession();
  const proposal = await app.store.propose(owner, {
    paymentId: 'payment-001',
    lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }],
  });

  try {
    const own = await fetch(`${app.url}/api/proposals/${proposal.proposalId}`, {
      headers: { cookie: `invoicing_session=${owner}` },
    });
    const foreign = await fetch(
      `${app.url}/api/proposals/${proposal.proposalId}`,
      {
        headers: { cookie: `invoicing_session=${other}` },
      },
    );
    const missing = await fetch(`${app.url}/api/proposals/missing`, {
      headers: { cookie: `invoicing_session=${owner}` },
    });

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual(proposal);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await app.store.snapshot(owner)).allocations).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('review lookup binds the proposal to its session and conversation', async () => {
  const app = await fixture();
  const owner = await app.store.createSession();
  const other = await app.store.createSession();
  const context = await app.reviews.authorize(owner, {
    threadId: 'review-1',
    runId: 'run-1',
    state: { selectedPaymentId: 'payment-001' },
    hashbrown: { ui: true, responseSchema: {} },
  });
  const proposal = await app.reviews.prepare(context, {
    paymentId: 'payment-001',
    lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }],
  });

  try {
    const read = (thread: string, session = owner, method = 'GET') =>
      fetch(`${app.url}/api/reviews/${thread}`, {
        method,
        headers: { cookie: `invoicing_session=${session}` },
      });
    const own = await read('review-1');
    const foreign = await read('review-1', other);
    const missing = await read('review-2');
    const write = await read('review-1', owner, 'POST');
    await app.store.reset(owner);
    const stale = await read('review-1');

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual(proposal);
    expect(own.headers.get('cache-control')).toBe('no-store');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(write.status).toBe(405);
    expect(stale.status).toBe(404);
    expect((await app.store.snapshot(other)).allocations).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('only the canonical POST review route reaches the agent runtime', async () => {
  const requests: string[] = [];
  const app = await fixture((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(202);
    response.end();
  });

  try {
    const review = await fetch(`${app.url}/agui/%2Freview%23agent`, {
      method: 'POST',
    });
    const read = await fetch(`${app.url}/agui/%2Freview%23agent`);
    const alternate = await fetch(`${app.url}/agui/%2Fother%23agent`, {
      method: 'POST',
    });
    const threads = await fetch(`${app.url}/threads`);
    const resume = await fetch(`${app.url}/threads/other/resume`, {
      method: 'POST',
    });

    expect(review.status).toBe(202);
    expect(requests).toEqual(['/agui/%2Freview%23agent']);
    expect(read.status).toBe(405);
    expect(read.headers.get('allow')).toBe('POST');
    expect(alternate.status).toBe(404);
    expect(threads.status).toBe(404);
    expect(resume.status).toBe(404);
  } finally {
    await app.close();
  }
});
