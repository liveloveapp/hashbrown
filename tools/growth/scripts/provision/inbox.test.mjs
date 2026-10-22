import assert from 'node:assert/strict';
import test from 'node:test';

import { pilotDnsRecords, provisionInboxPilot } from './inbox.mjs';

test('pilot DNS names are confined to the receiving subdomain', () => {
  const records = pilotDnsRecords([
    { name: '@', type: 'MX', value: 'receive.example.com', priority: 10 },
    { name: 'resend._domainkey.replies', type: 'TXT', value: 'key' },
  ]);

  assert.equal(records[0].name, 'replies.hashbrown.dev');
  assert.equal(records[1].name, 'resend._domainkey.replies.hashbrown.dev');
  assert.throws(() =>
    pilotDnsRecords([{ name: 'hashbrown.dev', type: 'MX', value: 'wrong' }]),
  );
});

test('setup defaults to a read-only plan and never changes root receiving', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    return { data: [], has_more: false };
  };

  const result = await provisionInboxPilot(request);

  assert.deepEqual(result.actions, ['create receiving subdomain']);
  assert.ok(calls.every(({ method }) => method === 'GET'));
});

test('apply creates only the pilot domain and waits for DNS verification', async () => {
  const calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/domains' && method === 'GET') return { data: [] };
    if (path === '/domains' && method === 'POST') return { id: 'pilot-domain' };
    if (path === '/domains/pilot-domain' && method === 'GET')
      return {
        id: 'pilot-domain',
        name: 'replies.hashbrown.dev',
        status: 'pending',
        capabilities: { receiving: 'enabled' },
        records: [
          { name: 'replies', type: 'MX', value: 'receive.example.com' },
        ],
      };
    throw new Error(`unexpected ${method} ${path}`);
  };

  const result = await provisionInboxPilot(request, { apply: true });

  assert.equal(result.state, 'awaiting_dns');
  assert.equal(
    calls.find(({ method }) => method === 'POST').body.name,
    'replies.hashbrown.dev',
  );
  assert.deepEqual(
    calls.find(({ method }) => method === 'POST').body.capabilities,
    { sending: 'disabled', receiving: 'enabled' },
  );
  assert.equal(result.dns[0].name, 'replies.hashbrown.dev');
});

test('a verified existing pilot is reused without mutation', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    if (path === '/domains')
      return { data: [{ id: 'pilot-domain', name: 'replies.hashbrown.dev' }] };
    if (path === '/domains/pilot-domain')
      return {
        id: 'pilot-domain',
        name: 'replies.hashbrown.dev',
        status: 'verified',
        capabilities: { receiving: 'enabled' },
        records: [],
      };
    throw new Error('unexpected');
  };

  const result = await provisionInboxPilot(request, { apply: true });

  assert.equal(result.state, 'ready');
  assert.equal(result.address, 'brian@replies.hashbrown.dev');
  assert.equal(result.inboxId, undefined);
  assert.ok(calls.every(({ path }) => path.startsWith('/domains')));
  assert.ok(calls.every(({ method }) => method === 'GET'));
});

test('a verified domain with disabled receiving is a read-only domain plan', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    if (path === '/domains')
      return { data: [{ id: 'pilot-domain', name: 'replies.hashbrown.dev' }] };
    if (path === '/domains/pilot-domain')
      return {
        name: 'replies.hashbrown.dev',
        status: 'verified',
        capabilities: { receiving: 'disabled' },
        records: [],
      };
    throw new Error('unexpected endpoint');
  };

  const result = await provisionInboxPilot(request);

  assert.equal(result.state, 'planned');
  assert.deepEqual(result.actions, ['enable subdomain receiving']);
  assert.ok(
    calls.every(
      ({ method, path }) => method === 'GET' && path.startsWith('/domains'),
    ),
  );
});

test('apply enables only subdomain receiving and returns its address when verified', async () => {
  const calls = [];
  let enabled = false;
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path === '/domains')
      return { data: [{ id: 'pilot-domain', name: 'replies.hashbrown.dev' }] };
    if (method === 'GET' && path === '/domains/pilot-domain')
      return {
        name: 'replies.hashbrown.dev',
        status: 'verified',
        capabilities: { receiving: enabled ? 'enabled' : 'disabled' },
        records: [],
      };
    if (method === 'PATCH' && path === '/domains/pilot-domain') {
      enabled = true;
      return {};
    }
    throw new Error('unexpected endpoint');
  };

  const result = await provisionInboxPilot(request, { apply: true });

  assert.equal(result.state, 'ready');
  assert.equal(result.address, 'brian@replies.hashbrown.dev');
  assert.deepEqual(
    calls.find(({ method }) => method === 'PATCH').body.capabilities,
    { receiving: 'enabled' },
  );
  assert.ok(calls.every(({ path }) => path.startsWith('/domains')));
});
