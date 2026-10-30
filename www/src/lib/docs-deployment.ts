/** The build identity already published by the docs Source tab. */
export interface DocsDeploymentIdentity {
  readonly origin: string;
  readonly revision: string;
}

/** Inputs for bounded, read-only deployment readiness checks. */
export interface DocsRevisionOptions {
  readonly origin: string;
  readonly expectedRevision: string;
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly requestTimeoutMs?: number;
  readonly fetchRevision?: (
    url: string,
    init: RequestInit,
  ) => Promise<Response>;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

/** Accept a plain HTTPS origin, or HTTP loopback for local verification. */
export function requireDeploymentOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  ) {
    throw new Error(
      'Deployment verification requires an HTTPS origin without credentials, paths or query parameters',
    );
  }
  return url.origin;
}

/** Identify an origin in diagnostics without retaining credentials, paths or query values. */
export function diagnosticOrigin(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      ? url.origin
      : url.protocol;
  } catch {
    return 'invalid-origin';
  }
}

const validRevision = (value: string) => /^[a-f0-9]{40}$/.test(value);

/** Wait only for revision propagation; time out requests and reject redirects. */
export async function waitForDocsRevision(
  options: DocsRevisionOptions,
): Promise<DocsDeploymentIdentity> {
  const origin = requireDeploymentOrigin(options.origin);
  const { expectedRevision } = options;
  if (!validRevision(expectedRevision))
    throw new Error(
      'Deployment verification requires a full lowercase Git revision',
    );
  const attempts = options.attempts ?? 12;
  const retryDelayMs = options.retryDelayMs ?? 5000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5000;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 24)
    throw new Error('Deployment readiness attempts must be between 1 and 24');
  if (
    !Number.isFinite(retryDelayMs) ||
    retryDelayMs < 0 ||
    retryDelayMs > 10000 ||
    !Number.isFinite(requestTimeoutMs) ||
    requestTimeoutMs < 1 ||
    requestTimeoutMs > 10000
  )
    throw new Error('Deployment readiness time limits are invalid');
  const fetchRevision = options.fetchRevision ?? fetch;
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError = '';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const identity = await Promise.race([
        (async () => {
          const response = await fetchRevision(
            `${origin}/workbench-source/react/generative-ui`,
            {
              method: 'GET',
              redirect: 'error',
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' },
              signal: controller.signal,
            },
          );
          if (!response.ok || response.redirected)
            throw new Error(
              `Identity request returned HTTP ${response.status} or redirected`,
            );
          const body: unknown = await response.json();
          const revision =
            body && typeof body === 'object' && 'commit' in body
              ? body.commit
              : undefined;
          if (
            typeof revision !== 'string' ||
            !validRevision(revision) ||
            revision !== expectedRevision
          )
            throw new Error(
              `Expected deployed revision ${expectedRevision} at ${origin}; received ${typeof revision === 'string' ? revision.slice(0, 64) : 'no full revision'}`,
            );
          return { origin, revision };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Identity request timed out at ${origin}`));
          }, requestTimeoutMs);
        }),
      ]);
      return identity;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < attempts) await wait(retryDelayMs);
  }
  throw new Error(`Docs deployment was not ready: ${lastError}`);
}

/** Verify both artifact identities around one production browser sweep; assertions are never retried. */
export async function verifyPublishedDocs(
  options: Omit<DocsRevisionOptions, 'origin' | 'attempts'> & {
    readonly immutableOrigin: string;
    readonly productionOrigin: string;
    readonly audit: (origin: string) => Promise<void>;
    readonly onIdentity?: (
      phase: 'before' | 'after',
      identity: DocsDeploymentIdentity,
    ) => void;
  },
) {
  const origins = [
    requireDeploymentOrigin(options.immutableOrigin),
    requireDeploymentOrigin(options.productionOrigin),
  ];
  const check = async (phase: 'before' | 'after') =>
    Promise.all(
      origins.map(async (origin) => {
        const identity = await waitForDocsRevision({
          ...options,
          origin,
          attempts: phase === 'before' ? 12 : 1,
        });
        options.onIdentity?.(phase, identity);
        return identity;
      }),
    );
  const before = await check('before');
  await options.audit(origins[1]);
  const after = await check('after');
  return {
    passed: true as const,
    expectedRevision: options.expectedRevision,
    before,
    after,
  };
}

/** GitHub deployment success includes production-www verification, not only upload. */
export function deploymentStatus(options: {
  readonly environment: 'preview' | 'production';
  readonly target: string;
  readonly deploy: string;
  readonly verification: string;
  readonly cancelled: boolean;
}): {
  readonly state: 'success' | 'failure' | 'error';
  readonly description: string;
} {
  if (
    options.cancelled ||
    options.deploy === 'cancelled' ||
    options.verification === 'cancelled'
  )
    return {
      state: 'error',
      description: 'Deployment or verification was cancelled.',
    };
  if (options.deploy !== 'success')
    return { state: 'failure', description: 'Deployment upload failed.' };
  if (
    options.environment === 'production' &&
    options.target === 'www' &&
    options.verification !== 'success'
  )
    return {
      state: 'failure',
      description:
        'Deployment uploaded; production documentation verification failed.',
    };
  return {
    state: 'success',
    description:
      options.environment === 'production' && options.target === 'www'
        ? 'Production documentation verified.'
        : 'Deployment uploaded.',
  };
}
