#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { createChecklist, createJsonClient } from './lib.mjs';

const NEON_BASE_URL = 'https://console.neon.tech/api/v2';
const PROJECT_NAME = 'hashbrown-growth';
const DATABASES = { app: 'growth', b4: 'b4_state' };

/**
 * Finds the Neon project with this name, creating it when absent.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {string} name Project name.
 * @returns {Promise<{ status: 'created' | 'exists', project: { id: string } }>}
 */
export async function ensureNeonProject(neon, name) {
  const found = await neon(
    'GET',
    `/projects?search=${encodeURIComponent(name)}`,
  );
  const match = (found.projects ?? []).find((p) => p.name === name);
  if (match) return { status: 'exists', project: { id: match.id } };

  const created = await neon('POST', '/projects', {
    project: { name, region_id: 'aws-us-east-1', pg_version: 17 },
  });
  return { status: 'created', project: { id: created.project.id } };
}

/**
 * Reads the default branch and its first unprotected role, so reruns do not
 * depend on the project creation response.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {string} projectId Neon project id.
 * @returns {Promise<{ branchId: string, roleName: string }>}
 */
export async function defaultBranchAndRole(neon, projectId) {
  const { branches } = await neon('GET', `/projects/${projectId}/branches`);
  const main = branches.find((b) => b.default);
  if (!main) throw new Error(`Project ${projectId} has no default branch`);
  const { roles } = await neon(
    'GET',
    `/projects/${projectId}/branches/${main.id}/roles`,
  );
  const role = roles.find((r) => !r.protected);
  if (!role) throw new Error(`Project ${projectId} has no unprotected role`);
  return { branchId: main.id, roleName: role.name };
}

/**
 * Finds a branch by name, creating it (with a read-write endpoint) when absent.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {string} projectId Neon project id.
 * @param {string} name Branch name.
 * @param {string} parentId Parent branch id used on creation.
 * @returns {Promise<{ status: 'created' | 'exists', branch: { id: string } }>}
 */
export async function ensureBranch(neon, projectId, name, parentId) {
  const { branches } = await neon('GET', `/projects/${projectId}/branches`);
  const match = branches.find((b) => b.name === name);
  if (match) return { status: 'exists', branch: { id: match.id } };

  const created = await neon('POST', `/projects/${projectId}/branches`, {
    branch: { name, parent_id: parentId },
    endpoints: [{ type: 'read_write' }],
  });
  return { status: 'created', branch: { id: created.branch.id } };
}

/**
 * Ensures a database exists on a branch, creating it when absent.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {string} projectId Neon project id.
 * @param {string} branchId Branch id.
 * @param {string} name Database name.
 * @param {string} ownerName Owning role name.
 * @returns {Promise<'created' | 'exists'>}
 */
export async function ensureDatabase(
  neon,
  projectId,
  branchId,
  name,
  ownerName,
) {
  const base = `/projects/${projectId}/branches/${branchId}/databases`;
  const { databases } = await neon('GET', base);
  if (databases.some((d) => d.name === name)) return 'exists';

  await neon('POST', base, { database: { name, owner_name: ownerName } });
  return 'created';
}

/**
 * Fetches the pooled connection string for a database. The value is a secret;
 * callers must not log it.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {string} projectId Neon project id.
 * @param {string} branchId Branch id.
 * @param {string} databaseName Database name.
 * @param {string} roleName Role name.
 * @returns {Promise<string>}
 */
export async function connectionUri(
  neon,
  projectId,
  branchId,
  databaseName,
  roleName,
) {
  const query = new URLSearchParams({
    branch_id: branchId,
    database_name: databaseName,
    role_name: roleName,
    pooled: 'true',
  });
  const { uri } = await neon(
    'GET',
    `/projects/${projectId}/connection_uri?${query}`,
  );
  return uri;
}

/**
 * Provisions the growth Neon project: `main` and `preview` branches, each with
 * the `growth` and `b4_state` databases. Records each step on the checklist
 * (never a connection string) and returns the pooled URLs keyed as the Vercel
 * environment expects.
 *
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} neon JSON client for the Neon API.
 * @param {{ add: (step: string, outcome: string, detail?: string) => void }} checklist Step recorder.
 * @returns {Promise<{ DATABASE_URL: string, B4_DATABASE_URL: string, PREVIEW_DATABASE_URL: string, PREVIEW_B4_DATABASE_URL: string }>}
 */
export async function provisionNeon(neon, checklist) {
  const { status, project } = await ensureNeonProject(neon, PROJECT_NAME);
  checklist.add(`Neon project ${PROJECT_NAME}`, status);

  const { branchId: mainId, roleName } = await defaultBranchAndRole(
    neon,
    project.id,
  );
  const preview = await ensureBranch(neon, project.id, 'preview', mainId);
  checklist.add('Neon branch preview', preview.status);

  const branches = [
    { label: 'main', id: mainId },
    { label: 'preview', id: preview.branch.id },
  ];
  const urls = {};
  for (const branch of branches) {
    for (const database of Object.values(DATABASES)) {
      const dbStatus = await ensureDatabase(
        neon,
        project.id,
        branch.id,
        database,
        roleName,
      );
      checklist.add(`Neon database ${database} on ${branch.label}`, dbStatus);
      urls[`${branch.label}:${database}`] = await connectionUri(
        neon,
        project.id,
        branch.id,
        database,
        roleName,
      );
    }
  }

  return {
    DATABASE_URL: urls[`main:${DATABASES.app}`],
    B4_DATABASE_URL: urls[`main:${DATABASES.b4}`],
    PREVIEW_DATABASE_URL: urls[`preview:${DATABASES.app}`],
    PREVIEW_B4_DATABASE_URL: urls[`preview:${DATABASES.b4}`],
  };
}

async function main() {
  const token = process.env.NEON_API_KEY;
  if (!token) throw new Error('NEON_API_KEY is required');
  const neon = createJsonClient({ baseUrl: NEON_BASE_URL, token });
  const checklist = createChecklist();
  await provisionNeon(neon, checklist);
  checklist.print();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
