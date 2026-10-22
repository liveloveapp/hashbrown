import { hasExactBearerToken } from './service-auth.ts';

/** The slice of the generated b4run Vercel function (a Hono app) the adapter calls. */
export interface B4FetchApp {
  fetch(
    request: Request,
    env: Record<string, string>,
  ): Response | Promise<Response>;
}

/** The Vercel function the lifecycle service exports. */
export interface LifecycleVercelAdapter {
  fetch(request: Request): Promise<Response>;
}

/** Environment readers, injectable for tests; each defaults to `process.env`. */
export interface LifecycleVercelAdapterDeps {
  /** Reads `LIFECYCLE_SERVICE_SECRET`. */
  readSecret: () => string | undefined;
  /** Reads `VERCEL_DEPLOYMENT_ID`. */
  readDeploymentId: () => string | undefined;
  /** Reads `B4_DATABASE_URL`; never falls back to the growth `DATABASE_URL`. */
  readStateDatabaseUrl: () => string | undefined;
  /** Reads `B4_PG_SCHEMA`. */
  readStateSchema: () => string | undefined;
  /** Reads `B4_PG_TABLE_PREFIX`. */
  readStateTablePrefix: () => string | undefined;
}

const defaultDeps: LifecycleVercelAdapterDeps = {
  readSecret: () => process.env['LIFECYCLE_SERVICE_SECRET'],
  readDeploymentId: () => process.env['VERCEL_DEPLOYMENT_ID'],
  readStateDatabaseUrl: () => process.env['B4_DATABASE_URL'],
  readStateSchema: () => process.env['B4_PG_SCHEMA'],
  readStateTablePrefix: () => process.env['B4_PG_TABLE_PREFIX'],
};

function jsonError(status: number, error: string): Response {
  return Response.json(
    { error },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Builds the env for one b4run call: `DATABASE_URL` set to the state
 * database, plus `B4_PG_SCHEMA` and `B4_PG_TABLE_PREFIX` when they are set.
 * b4run 0.14 resolves its store settings as `env[name] ?? process.env[name]`,
 * so this points threads, checkpoints and permissions at the state database
 * without touching `process.env`. Nothing else is forwarded, so b4run's
 * one-time env seed (`seedRuntimeEnvOnce`) never sees the growth
 * `DATABASE_URL`.
 */
function stateEnv(
  databaseUrl: string,
  deps: LifecycleVercelAdapterDeps,
): Record<string, string> {
  const schema = present(deps.readStateSchema());
  const prefix = present(deps.readStateTablePrefix());
  return {
    DATABASE_URL: databaseUrl,
    ...(schema === undefined ? {} : { B4_PG_SCHEMA: schema }),
    ...(prefix === undefined ? {} : { B4_PG_TABLE_PREFIX: prefix }),
  };
}

/**
 * Wraps the generated b4run Vercel function with the lifecycle service gate.
 *
 * In order: no `LIFECYCLE_SERVICE_SECRET` answers 503
 * `{ error: 'service_secret_missing' }`; anything but the exact
 * `Bearer <secret>` answers 401 on every path (b4run's own `/healthz`,
 * `/readyz` and thread reads included); no `B4_DATABASE_URL` answers 503
 * `{ error: 'state_database_missing' }`. Otherwise the same `Request` reaches
 * `b4App.fetch` with only the state database env.
 * Every adapter response carries `cache-control: no-store`; authenticated
 * `/healthz` also carries `x-hashbrown-deployment-id`.
 *
 * @param b4App - The default export of the generated `functions/b4.func/index.mjs`.
 * @param overrides - Environment readers; each defaults to `process.env`.
 * @returns The lifecycle Vercel function.
 */
export function createLifecycleVercelAdapter(
  b4App: B4FetchApp,
  overrides: Partial<LifecycleVercelAdapterDeps> = {},
): LifecycleVercelAdapter {
  const deps: LifecycleVercelAdapterDeps = { ...defaultDeps, ...overrides };
  return {
    async fetch(request: Request): Promise<Response> {
      const secret = deps.readSecret();
      if (!secret) return jsonError(503, 'service_secret_missing');
      if (
        !hasExactBearerToken(
          request.headers.get('authorization') ?? undefined,
          secret,
        )
      ) {
        return jsonError(401, 'unauthorized');
      }
      const databaseUrl = present(deps.readStateDatabaseUrl());
      if (!databaseUrl) return jsonError(503, 'state_database_missing');

      const response = await b4App.fetch(request, stateEnv(databaseUrl, deps));

      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      const deploymentId = present(deps.readDeploymentId());
      if (new URL(request.url).pathname === '/healthz' && deploymentId) {
        headers.set('x-hashbrown-deployment-id', deploymentId);
      }
      return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    },
  };
}
