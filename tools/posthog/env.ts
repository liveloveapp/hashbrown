/**
 * Environment for the PostHog tools. Values come from the process environment
 * (Nx loads the root `.env` for `nx run` targets). Error messages name the
 * variable at fault and never echo its value.
 */

/** The validated environment the PostHog tools run with. */
export interface PosthogEnv {
  /** Personal API key, at least 20 characters. */
  readonly POSTHOG_PERSONAL_API_KEY: string;
  /** API host without a trailing slash; defaults to `https://us.i.posthog.com`. */
  readonly POSTHOG_HOST: string;
  /** Numeric project id, a positive integer. */
  readonly POSTHOG_PROJECT_ID: number;
}

/** The host used when `POSTHOG_HOST` is unset or empty. */
export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Validates and normalizes a PostHog tools environment.
 *
 * @param source - The variables to read, usually `process.env`.
 * @returns The parsed environment.
 * @throws Error naming every invalid variable, never its value.
 */
export function parseEnv(
  source: Readonly<Record<string, string | undefined>>,
): PosthogEnv {
  const problems: string[] = [];

  const key = blankToUndefined(source['POSTHOG_PERSONAL_API_KEY']);
  if (key === undefined || key.length < 20) {
    problems.push('POSTHOG_PERSONAL_API_KEY must be at least 20 characters');
  }

  const rawHost =
    blankToUndefined(source['POSTHOG_HOST']) ?? DEFAULT_POSTHOG_HOST;
  let host = rawHost;
  try {
    const url = new URL(rawHost);
    if (url.protocol !== 'https:') throw new Error('not https');
    host = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    problems.push('POSTHOG_HOST must be an https URL');
  }

  const rawId = blankToUndefined(source['POSTHOG_PROJECT_ID']);
  const projectId =
    rawId !== undefined && /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    problems.push('POSTHOG_PROJECT_ID must be a positive integer');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid PostHog environment: ${problems.join('; ')}`);
  }

  return {
    POSTHOG_PERSONAL_API_KEY: key as string,
    POSTHOG_HOST: host,
    POSTHOG_PROJECT_ID: projectId,
  };
}

/**
 * Parses `process.env` on every call, so a changed environment is never
 * hidden behind a cached value.
 *
 * @returns The parsed environment.
 */
export function env(): PosthogEnv {
  return parseEnv(process.env);
}
