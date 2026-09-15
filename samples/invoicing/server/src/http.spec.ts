import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { createInvoicingListener } from './http';
import { createSessionStore } from './session-store';

async function fixture() {
  const store = createSessionStore();
  const server = createServer(createInvoicingListener(store));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    store,
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
  const owner = app.store.createSession();
  const other = app.store.createSession();
  const proposal = app.store.propose(owner, {
    paymentId: 'payment-001',
    invoiceId: 'invoice-001',
    amountCents: 240000,
  });
  app.store.decide(owner, { ...proposal, decision: 'approve' });

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
  const owner = app.store.createSession();

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
  const owner = app.store.createSession();
  const other = app.store.createSession();
  const proposal = app.store.propose(owner, {
    paymentId: 'payment-001',
    invoiceId: 'invoice-001',
    amountCents: 240000,
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
    expect(app.store.snapshot(owner).allocations).toHaveLength(0);
  } finally {
    await app.close();
  }
});
