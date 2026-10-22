import assert from 'node:assert/strict';
import test from 'node:test';

import { pilotDnsRecords, provisionInboxPilot } from './inbox.mjs';

const receiving = {
  record: 'Receiving',
  name: '',
  type: 'MX',
  value: 'receive.forge.rmta.net',
  priority: 10,
  status: 'verified',
};

test('DNS proposals include only root receiving and preserve sending records', () => {
  const records = pilotDnsRecords([
    receiving,
    { record: 'SPF', name: 'send', type: 'MX', value: 'sending.example.com' },
    { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'key' },
  ]);

  assert.deepEqual(records, [{ ...receiving, name: 'hashbrown.dev' }]);
  assert.throws(() =>
    pilotDnsRecords([{ ...receiving, name: 'replies.hashbrown.dev' }]),
  );
});

test('missing root domain is a read-only plan and apply never creates a legacy domain', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    return { data: [] };
  };

  const result = await provisionInboxPilot(request);
  await assert.rejects(
    provisionInboxPilot(request, { apply: true }),
    /Existing Hashbrown root domain required/,
  );

  assert.equal(result.state, 'planned');
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('verified root receiving is reused without mutation', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    if (path === '/domains')
      return {
        data: [
          { id: 'root-domain', name: 'hashbrown.dev' },
          { id: 'legacy-domain', name: 'replies.hashbrown.dev' },
        ],
      };
    if (path === '/domains/root-domain')
      return {
        name: 'hashbrown.dev',
        status: 'verified',
        capabilities: { sending: 'enabled', receiving: 'enabled' },
        records: [receiving],
      };
    throw new Error('Unexpected endpoint');
  };

  const result = await provisionInboxPilot(request, { apply: true });

  assert.equal(result.state, 'ready');
  assert.equal(result.address, 'brian@hashbrown.dev');
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(calls.every((call) => !call.path.includes('legacy-domain')));
});

test('disabled root receiving is planned without mutation', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push({ method, path });
    if (path === '/domains')
      return { data: [{ id: 'root-domain', name: 'hashbrown.dev' }] };
    return {
      name: 'hashbrown.dev',
      status: 'verified',
      capabilities: { receiving: 'disabled' },
      records: [],
    };
  };

  const result = await provisionInboxPilot(request);

  assert.equal(result.state, 'planned');
  assert.deepEqual(result.actions, ['enable root receiving']);
  assert.ok(calls.every((call) => call.method === 'GET'));
});

test('apply enables root receiving without changing sending or tracking', async () => {
  const calls = [];
  let enabled = false;
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/domains')
      return { data: [{ id: 'root-domain', name: 'hashbrown.dev' }] };
    if (method === 'PATCH') {
      enabled = true;
      return {};
    }
    return {
      name: 'hashbrown.dev',
      status: 'verified',
      capabilities: { receiving: enabled ? 'enabled' : 'disabled' },
      records: enabled ? [receiving] : [],
    };
  };

  const result = await provisionInboxPilot(request, { apply: true });

  assert.equal(result.state, 'ready');
  assert.equal(result.address, 'brian@hashbrown.dev');
  assert.deepEqual(calls.find((call) => call.method === 'PATCH').body, {
    capabilities: { receiving: 'enabled' },
  });
});
