import assert from 'node:assert/strict';
import test from 'node:test';

import { createVercelClient } from '../../../vercel/bootstrap.mjs';
import { createChecklist, createJsonClient } from './lib.mjs';
import {
  ensureResendDomain,
  ensureSendingKey,
  provisionResend,
  toVercelDnsRecords,
  verifyDomain,
} from './resend.mjs';
import { stubFetch } from './test-support.mjs';

const PROVISION_KEY = 're_provision_secret';
const VERCEL_TOKEN = 'vercel-token-secret';
const SENDING_TOKEN = 're_sending_token_secret';

const RECORDS = [
  {
    record: 'SPF',
    name: 'send',
    type: 'MX',
    value: 'feedback-smtp.us-east-1.amazonses.com',
    priority: 10,
    ttl: 'Auto',
  },
  {
    record: 'DKIM',
    name: 'resend._domainkey',
    type: 'TXT',
    value: 'p=abc',
    ttl: 'Auto',
  },
];

function clientsFor(routes) {
  const { fetchImpl, calls } = stubFetch(routes);
  const resend = createJsonClient({
    baseUrl: 'https://api.resend.com',
    token: PROVISION_KEY,
    fetchImpl,
  });
  const vercel = createVercelClient(VERCEL_TOKEN, fetchImpl);
  return { resend, vercel, calls };
}

const VERCEL_EXISTING = {
  'GET /v5/domains/hashbrown.dev/records?limit=100': {
    body: {
      records: [
        {
          name: 'send',
          type: 'MX',
          value: 'feedback-smtp.us-east-1.amazonses.com',
        },
        { name: 'resend._domainkey', type: 'TXT', value: 'p=abc' },
      ],
    },
  },
};

test('ensureResendDomain creates hashbrown.dev in us-east-1 when absent', async () => {
  const { resend, calls } = clientsFor({
    'GET /domains': { body: { data: [] } },
    'POST /domains': {
      body: { id: 'd1', name: 'hashbrown.dev', status: 'not_started' },
    },
    'GET /domains/d1': {
      body: {
        id: 'd1',
        name: 'hashbrown.dev',
        status: 'not_started',
        records: RECORDS,
      },
    },
  });

  const result = await ensureResendDomain(resend, 'hashbrown.dev');

  assert.equal(result.status, 'created');
  assert.deepEqual(result.domain, {
    id: 'd1',
    status: 'not_started',
    records: RECORDS,
  });
  assert.deepEqual(calls[1].body, {
    name: 'hashbrown.dev',
    region: 'us-east-1',
  });
});

test('ensureResendDomain reports exists when listed', async () => {
  const { resend, calls } = clientsFor({
    'GET /domains': {
      body: {
        data: [
          { id: 'd0', name: 'old.hashbrown.dev', status: 'verified' },
          { id: 'd1', name: 'hashbrown.dev', status: 'pending' },
        ],
      },
    },
    'GET /domains/d1': {
      body: { id: 'd1', status: 'pending', records: RECORDS },
    },
  });

  const result = await ensureResendDomain(resend, 'hashbrown.dev');

  assert.equal(result.status, 'exists');
  assert.equal(result.domain.id, 'd1');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('toVercelDnsRecords maps MX priority and Auto ttl', () => {
  const input = [
    {
      record: 'MX',
      name: 'send',
      type: 'MX',
      value: 'feedback-smtp.us-east-1.amazonses.com',
      priority: 10,
      ttl: 'Auto',
    },
    {
      record: 'DKIM',
      name: 'resend._domainkey',
      type: 'TXT',
      value: 'p=abc',
      ttl: 'Auto',
    },
  ];

  const result = toVercelDnsRecords(input);

  assert.deepEqual(result, [
    {
      name: 'send',
      type: 'MX',
      value: 'feedback-smtp.us-east-1.amazonses.com',
      ttl: 3600,
      mxPriority: 10,
    },
    { name: 'resend._domainkey', type: 'TXT', value: 'p=abc', ttl: 3600 },
  ]);
  assert.ok(!('priority' in result[0]));
  assert.ok(!('mxPriority' in result[1]));
});

test('ensureSendingKey creates a sending-only key and returns its token', async () => {
  const { resend, calls } = clientsFor({
    'GET /api-keys': { body: { data: [] } },
    'POST /api-keys': { body: { id: 'k1', token: SENDING_TOKEN } },
  });

  const result = await ensureSendingKey(resend, 'hashbrown-lifecycle', 'd1');

  assert.deepEqual(result, { status: 'created', token: SENDING_TOKEN });
  assert.deepEqual(calls[1].body, {
    name: 'hashbrown-lifecycle',
    permission: 'sending_access',
    domain_id: 'd1',
  });
});

test('ensureSendingKey does not create a second key with the same name and returns no token', async () => {
  const { resend, calls } = clientsFor({
    'GET /api-keys': {
      body: { data: [{ id: 'k1', name: 'hashbrown-lifecycle' }] },
    },
  });

  const result = await ensureSendingKey(resend, 'hashbrown-lifecycle', 'd1');

  assert.deepEqual(result, { status: 'exists' });
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('verifyDomain posts verify then returns the resulting status', async () => {
  const { resend, calls } = clientsFor({
    'POST /domains/d1/verify': { body: { object: 'domain', id: 'd1' } },
    'GET /domains/d1': { body: { id: 'd1', status: 'verified' } },
  });

  const status = await verifyDomain(resend, 'd1');

  assert.equal(status, 'verified');
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ['POST /domains/d1/verify', 'GET /domains/d1'],
  );
});

const EXISTING_ROUTES = {
  'GET /domains': {
    body: { data: [{ id: 'd1', name: 'hashbrown.dev', status: 'verified' }] },
  },
  'GET /domains/d1': {
    body: { id: 'd1', status: 'verified', records: RECORDS },
  },
  'POST /domains/d1/verify': { body: { object: 'domain', id: 'd1' } },
  'GET /api-keys': {
    body: { data: [{ id: 'k1', name: 'hashbrown-lifecycle' }] },
  },
  ...VERCEL_EXISTING,
};

test('provisionResend omits RESEND_API_KEY when the key existed', async () => {
  const { resend, vercel } = clientsFor(EXISTING_ROUTES);
  const checklist = createChecklist();

  const env = await provisionResend(resend, vercel, checklist);

  assert.deepEqual(env, {});
  assert.ok(!('RESEND_API_KEY' in env));
});

test('provisionResend returns the new sending key on first run', async () => {
  const { resend, vercel, calls } = clientsFor({
    ...EXISTING_ROUTES,
    'GET /domains': { body: { data: [] } },
    'POST /domains': { body: { id: 'd1', name: 'hashbrown.dev' } },
    'GET /api-keys': { body: { data: [] } },
    'POST /api-keys': { body: { id: 'k1', token: SENDING_TOKEN } },
    'GET /v5/domains/hashbrown.dev/records?limit=100': {
      body: { records: [] },
    },
    'POST /v2/domains/hashbrown.dev/records': { body: {} },
  });
  const checklist = createChecklist();

  const env = await provisionResend(resend, vercel, checklist);

  assert.deepEqual(env, { RESEND_API_KEY: SENDING_TOKEN });
  assert.equal(
    calls.filter((c) => c.path === '/v2/domains/hashbrown.dev/records').length,
    2,
  );
});

test('a rerun of a verified domain makes only GET calls and reports exists', async () => {
  const { resend, vercel, calls } = clientsFor(EXISTING_ROUTES);
  const checklist = createChecklist();

  await provisionResend(resend, vercel, checklist);

  const mutations = calls.filter((c) => c.method !== 'GET');
  assert.deepEqual(mutations, []);
  const lines = checklist.lines();
  const resendLines = lines.filter((l) => !/\smanual(\s|$)/.test(l));
  assert.ok(resendLines.length >= 3);
  assert.ok(resendLines.every((l) => /\s{2}exists(\s|$)/.test(l)));
  assert.equal(lines.filter((l) => /\smanual(\s|$)/.test(l)).length, 1);
});

test('a pending domain is verified with exactly one POST', async () => {
  const { resend, vercel, calls } = clientsFor({
    ...EXISTING_ROUTES,
    'GET /domains': {
      body: { data: [{ id: 'd1', name: 'hashbrown.dev', status: 'pending' }] },
    },
    'GET /domains/d1': {
      body: { id: 'd1', status: 'pending', records: RECORDS },
    },
  });
  const checklist = createChecklist();

  await provisionResend(resend, vercel, checklist);

  const mutations = calls.filter((c) => c.method !== 'GET');
  assert.deepEqual(
    mutations.map((c) => `${c.method} ${c.path}`),
    ['POST /domains/d1/verify'],
  );
});

test('the checklist never contains a token', async () => {
  const { resend, vercel } = clientsFor({
    ...EXISTING_ROUTES,
    'GET /api-keys': { body: { data: [] } },
    'POST /api-keys': { body: { id: 'k1', token: SENDING_TOKEN } },
  });
  const checklist = createChecklist();

  await provisionResend(resend, vercel, checklist);

  const text = checklist.lines().join('\n');
  for (const secret of [PROVISION_KEY, VERCEL_TOKEN, SENDING_TOKEN]) {
    assert.ok(!text.includes(secret));
  }
});
