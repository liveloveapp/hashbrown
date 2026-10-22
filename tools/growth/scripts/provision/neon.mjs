#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { createVercelClient } from '../../../vercel/bootstrap.mjs';
import { createChecklist } from './lib.mjs';

/**
 * Vercel client from `createVercelClient`.
 * @typedef {(method: string, path: string, body?: unknown) => Promise<any>} VercelClient
 */

const PROJECT_PRODUCTION = 'production';
const PROJECT_PREVIEW = 'preview';
const PROJECT_DEVELOPMENT = 'development';

/**
 * The stores and the connections each one needs. Vercel injects
 * `DATABASE_URL` and the `POSTGRES_*` family into the connected projects,
 * prefixed when `envVarPrefix` is set (so `B4_DATABASE_URL` on lifecycle).
 *
 * | store                         | environment | prefix | projects        |
 * | ----------------------------- | ----------- | ------ | --------------- |
 * | `growth-production-target-01` | production  |        | www, lifecycle  |
 * | `growth-preview-target-01`    | preview     |        | www, lifecycle  |
 * | `b4-production-target-01`     | production  | `B4_`  | lifecycle       |
 * | `b4-preview-target-01`        | preview     | `B4_`  | lifecycle       |
 * | `growth-test-target-01`       | development | `TEST_`| lifecycle       |
 *
 * The test store serves only the integration specs; its connection string is
 * read back as `TEST_DATABASE_URL` for the development environment.
 */
const STORE_PLAN = [
  {
    name: 'growth-production-target-01',
    environment: PROJECT_PRODUCTION,
    envVarPrefix: null,
    projects: ['www', 'lifecycle'],
  },
  {
    name: 'growth-preview-target-01',
    environment: PROJECT_PREVIEW,
    envVarPrefix: null,
    projects: ['www', 'lifecycle'],
  },
  {
    name: 'b4-production-target-01',
    environment: PROJECT_PRODUCTION,
    envVarPrefix: 'B4_',
    projects: ['lifecycle'],
  },
  {
    name: 'b4-preview-target-01',
    environment: PROJECT_PREVIEW,
    envVarPrefix: 'B4_',
    projects: ['lifecycle'],
  },
  {
    name: 'growth-test-target-01',
    environment: PROJECT_DEVELOPMENT,
    envVarPrefix: 'TEST_',
    projects: ['lifecycle'],
  },
];

/**
 * Finds the id of the team's installed Neon integration configuration.
 *
 * @param {VercelClient} vercel Vercel client (team scoped).
 * @returns {Promise<string>} The configuration id.
 * @throws When the Neon integration is not installed on the team.
 */
export async function findNeonConfiguration(vercel) {
  const listing = await vercel(
    'GET',
    '/v1/integrations/configurations?view=account',
  );
  const configurations = Array.isArray(listing)
    ? listing
    : (listing?.configurations ?? []);
  const neon = configurations.find((c) => c.slug === 'neon');
  if (!neon) {
    throw new Error(
      'The Neon integration is not installed on this Vercel team; install it from the Vercel Marketplace and rerun.',
    );
  }
  return neon.id;
}

const AUTHORIZATION_POLL_MS = 2000;
const AUTHORIZATION_MAX_POLLS = 15;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates the billing authorization Vercel requires before it will create a
 * marketplace store, and waits for it to succeed (polling every 2 seconds, up
 * to 15 times).
 *
 * @param {VercelClient} vercel Vercel client (team scoped).
 * @param {{ configurationId: string, sleep?: (ms: number) => Promise<void> }} options Neon configuration id and an injectable sleep.
 * @returns {Promise<string>} The authorization id.
 * @throws When the authorization fails or does not succeed in time.
 */
export async function createBillingAuthorization(
  vercel,
  { configurationId, sleep = defaultSleep },
) {
  const unwrap = (response) => response?.authorization ?? response;
  let authorization = unwrap(
    await vercel('POST', '/v1/integrations/billing/authorization', {
      integrationIdOrSlug: 'neon',
      productId: 'neon',
      billingPlanId: 'free_v3',
      integrationConfigurationId: configurationId,
      metadata: JSON.stringify({ region: 'iad1' }),
    }),
  );
  const id = authorization.id;
  for (let tries = 0; ; tries += 1) {
    if (authorization.status === 'succeeded') return id;
    if (authorization.status === 'failed') {
      throw new Error(
        `Neon billing authorization failed: ${authorization.reason ?? 'no reason given'}`,
      );
    }
    if (tries >= AUTHORIZATION_MAX_POLLS) {
      throw new Error(
        'Neon billing authorization did not succeed in time; rerun to continue.',
      );
    }
    await sleep(AUTHORIZATION_POLL_MS);
    authorization = unwrap(
      await vercel('GET', `/v1/integrations/billing/authorization/${id}`),
    );
  }
}

/**
 * Finds a Neon integration store by name, creating it on the free plan in
 * `iad1` when absent. Creation first obtains a billing authorization; an
 * existing store makes no authorization call.
 *
 * @param {VercelClient} vercel Vercel client (team scoped).
 * @param {{ name: string, configurationId: string, sleep?: (ms: number) => Promise<void> }} options Store name, the Neon configuration id, and an injectable sleep.
 * @returns {Promise<{ status: 'created' | 'exists', store: { id: string, name: string, projectsMetadata: any[] } }>}
 */
export async function ensureStore(vercel, { name, configurationId, sleep }) {
  const { stores = [] } = await vercel('GET', '/v1/storage/stores');
  const match = stores.find((s) => s.name === name);
  if (match) {
    return {
      status: 'exists',
      store: {
        id: match.id,
        name: match.name,
        projectsMetadata: match.projectsMetadata ?? [],
      },
    };
  }

  const authorizationId = await createBillingAuthorization(vercel, {
    configurationId,
    sleep,
  });
  const { store } = await vercel('POST', '/v1/storage/stores/integration', {
    integrationConfigurationId: configurationId,
    integrationProductIdOrSlug: 'neon',
    billingPlanId: 'free_v3',
    name,
    metadata: { region: 'iad1' },
    authorizationId,
  });
  return {
    status: 'created',
    store: { id: store.id, name: store.name, projectsMetadata: [] },
  };
}

/**
 * Connects a store to a project for one environment, unless the store's
 * `projectsMetadata` already shows that project, environment and prefix.
 *
 * @param {VercelClient} vercel Vercel client (team scoped).
 * @param {{ id: string, projectsMetadata?: any[] }} store Store from {@link ensureStore}.
 * @param {{ projectId: string, environment: 'production' | 'preview' | 'development', envVarPrefix?: string | null }} options Connection to ensure.
 * @returns {Promise<'created' | 'exists'>}
 */
export async function ensureConnection(
  vercel,
  store,
  { projectId, environment, envVarPrefix = null },
) {
  const connected = (store.projectsMetadata ?? []).some(
    (entry) =>
      entry.projectId === projectId &&
      (entry.environments ?? []).includes(environment) &&
      (entry.envVarPrefix ?? null) === envVarPrefix,
  );
  if (connected) return 'exists';

  await vercel('POST', `/v1/storage/stores/${store.id}/connections`, {
    projectId,
    envVarEnvironments: [environment],
    ...(envVarPrefix ? { envVarPrefix } : {}),
  });
  return 'created';
}

/**
 * Provisions the Neon stores through the Vercel Marketplace integration and
 * connects them to `hashbrown-www` and `hashbrown-lifecycle`. Vercel injects
 * the connection strings, so nothing is returned for the env file and no
 * value reaches the checklist.
 *
 * @param {VercelClient} vercel Vercel client (team scoped).
 * @param {{ add: (step: string, outcome: string, detail?: string) => void }} checklist Step recorder.
 * @param {{ projectIds: { www: string, lifecycle: string }, sleep?: (ms: number) => Promise<void> }} options Vercel project ids and an injectable sleep.
 * @returns {Promise<{}>}
 */
export async function provisionNeon(vercel, checklist, { projectIds, sleep }) {
  const configurationId = await findNeonConfiguration(vercel);
  for (const plan of STORE_PLAN) {
    const { status, store } = await ensureStore(vercel, {
      name: plan.name,
      configurationId,
      sleep,
    });
    checklist.add(`Neon store ${plan.name}`, status, 'Vercel integration');
    for (const key of plan.projects) {
      const outcome = await ensureConnection(vercel, store, {
        projectId: projectIds[key],
        environment: plan.environment,
        envVarPrefix: plan.envVarPrefix,
      });
      const project = key === 'www' ? 'hashbrown-www' : 'hashbrown-lifecycle';
      const prefix = plan.envVarPrefix ? `, prefix ${plan.envVarPrefix}` : '';
      checklist.add(
        `Neon store ${plan.name} -> ${project}`,
        outcome,
        `${plan.environment}${prefix}`,
      );
    }
  }
  return {};
}

async function main() {
  const vercelToken = process.env.VERCEL_TOKEN ?? process.env.VERCEL_API_TOKEN;
  if (!vercelToken) throw new Error('VERCEL_TOKEN is required');
  const { user } = await createVercelClient(vercelToken)('GET', '/v2/user');
  const vercel = createVercelClient(vercelToken, fetch, {
    teamId: user.defaultTeamId ?? undefined,
  });
  const [www, lifecycle] = await Promise.all([
    vercel('GET', '/v9/projects/hashbrown-www'),
    vercel('GET', '/v9/projects/hashbrown-lifecycle'),
  ]);
  const checklist = createChecklist();
  await provisionNeon(vercel, checklist, {
    projectIds: { www: www.id, lifecycle: lifecycle.id },
  });
  checklist.print();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
