import assert from 'node:assert/strict';
import test from 'node:test';

import { createChecklist, createJsonClient } from './lib.mjs';
import {
  connectionUri,
  defaultBranchAndRole,
  ensureBranch,
  ensureDatabase,
  ensureNeonProject,
  provisionNeon,
} from './neon.mjs';
import { stubFetch } from './test-support.mjs';

const BASE = 'https://console.neon.tech/api/v2';

function clientFor(routes) {
  const { fetchImpl, calls } = stubFetch(routes);
  const neon = createJsonClient({
    baseUrl: BASE,
    token: 'neon-key-secret',
    fetchImpl,
  });
  return { neon, calls };
}

test('ensureNeonProject creates the project when the search is empty', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects?search=hashbrown-growth': { body: { projects: [] } },
    'POST /api/v2/projects': { body: { project: { id: 'p1' } } },
  });

  const result = await ensureNeonProject(neon, 'hashbrown-growth');

  assert.deepEqual(result, { status: 'created', project: { id: 'p1' } });
  assert.deepEqual(calls[1].body, {
    project: {
      name: 'hashbrown-growth',
      region_id: 'aws-us-east-1',
      pg_version: 17,
    },
  });
});

test('ensureNeonProject reports exists and makes no POST when found', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects?search=hashbrown-growth': {
      body: { projects: [{ id: 'p9', name: 'hashbrown-growth' }] },
    },
  });

  const result = await ensureNeonProject(neon, 'hashbrown-growth');

  assert.deepEqual(result, { status: 'exists', project: { id: 'p9' } });
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});

test('defaultBranchAndRole reads the default branch and first unprotected role', async () => {
  const { neon } = clientFor({
    'GET /api/v2/projects/p1/branches': {
      body: {
        branches: [
          { id: 'b2', name: 'preview', default: false },
          { id: 'b1', name: 'main', default: true },
        ],
      },
    },
    'GET /api/v2/projects/p1/branches/b1/roles': {
      body: {
        roles: [
          { name: 'cloud_admin', protected: true },
          { name: 'owner', protected: false },
        ],
      },
    },
  });

  const result = await defaultBranchAndRole(neon, 'p1');

  assert.deepEqual(result, { branchId: 'b1', roleName: 'owner' });
});

test('ensureBranch creates preview from the default branch', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects/p1/branches': {
      body: { branches: [{ id: 'b1', name: 'main', default: true }] },
    },
    'POST /api/v2/projects/p1/branches': {
      body: { branch: { id: 'b2', name: 'preview' } },
    },
  });

  const result = await ensureBranch(neon, 'p1', 'preview', 'b1');

  assert.deepEqual(result, { status: 'created', branch: { id: 'b2' } });
  assert.deepEqual(calls[1].body, {
    branch: { name: 'preview', parent_id: 'b1' },
    endpoints: [{ type: 'read_write' }],
  });
});

test('ensureBranch reports exists when the branch is present', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects/p1/branches': {
      body: { branches: [{ id: 'b2', name: 'preview', default: false }] },
    },
  });

  const result = await ensureBranch(neon, 'p1', 'preview', 'b1');

  assert.deepEqual(result, { status: 'exists', branch: { id: 'b2' } });
  assert.equal(calls.length, 1);
});

test('ensureDatabase is a no-op when the database exists', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects/p1/branches/b1/databases': {
      body: { databases: [{ name: 'growth' }] },
    },
  });

  const status = await ensureDatabase(neon, 'p1', 'b1', 'growth', 'owner');

  assert.equal(status, 'exists');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});

test('ensureDatabase creates the database with its owner', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects/p1/branches/b1/databases': {
      body: { databases: [] },
    },
    'POST /api/v2/projects/p1/branches/b1/databases': {
      body: { database: { name: 'growth' } },
    },
  });

  const status = await ensureDatabase(neon, 'p1', 'b1', 'growth', 'owner');

  assert.equal(status, 'created');
  assert.deepEqual(calls[1].body, {
    database: { name: 'growth', owner_name: 'owner' },
  });
});

test('connectionUri requests a pooled URI', async () => {
  const { neon, calls } = clientFor({
    'GET /api/v2/projects/p1/connection_uri?branch_id=b1&database_name=growth&role_name=owner&pooled=true':
      { body: { uri: 'postgres://pooled' } },
  });

  const uri = await connectionUri(neon, 'p1', 'b1', 'growth', 'owner');

  assert.equal(uri, 'postgres://pooled');
  assert.equal(calls.length, 1);
});

test('provisionNeon returns four pooled connection strings keyed as the Vercel env expects', async () => {
  const uri = (b, d) =>
    `/api/v2/projects/p1/connection_uri?branch_id=${b}&database_name=${d}&role_name=owner&pooled=true`;
  const { neon, calls } = clientFor({
    'GET /api/v2/projects?search=hashbrown-growth': {
      body: { projects: [{ id: 'p1', name: 'hashbrown-growth' }] },
    },
    'GET /api/v2/projects/p1/branches': {
      body: {
        branches: [
          { id: 'b1', name: 'main', default: true },
          { id: 'b2', name: 'preview', default: false },
        ],
      },
    },
    'GET /api/v2/projects/p1/branches/b1/roles': {
      body: { roles: [{ name: 'owner', protected: false }] },
    },
    'GET /api/v2/projects/p1/branches/b1/databases': {
      body: { databases: [{ name: 'growth' }, { name: 'b4_state' }] },
    },
    'GET /api/v2/projects/p1/branches/b2/databases': {
      body: { databases: [{ name: 'growth' }, { name: 'b4_state' }] },
    },
    [`GET ${uri('b1', 'growth')}`]: { body: { uri: 'main-growth' } },
    [`GET ${uri('b1', 'b4_state')}`]: { body: { uri: 'main-b4' } },
    [`GET ${uri('b2', 'growth')}`]: { body: { uri: 'prev-growth' } },
    [`GET ${uri('b2', 'b4_state')}`]: { body: { uri: 'prev-b4' } },
  });
  const checklist = createChecklist();

  const env = await provisionNeon(neon, checklist);

  assert.deepEqual(env, {
    DATABASE_URL: 'main-growth',
    B4_DATABASE_URL: 'main-b4',
    PREVIEW_DATABASE_URL: 'prev-growth',
    PREVIEW_B4_DATABASE_URL: 'prev-b4',
  });
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.ok(checklist.lines().every((l) => !l.includes('neon-key-secret')));
  assert.ok(checklist.lines().every((l) => !l.includes('postgres://')));
});
