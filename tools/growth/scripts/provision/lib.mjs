import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Minimal JSON REST client for vendor APIs: token auth, JSON bodies, and
 * errors that carry `status`. The token never appears in an error message.
 *
 * @param {object} options
 * @param {string} options.baseUrl Origin and path prefix, without a trailing slash.
 * @param {string} options.token API token sent in the authorization header.
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch for tests.
 * @param {string} [options.scheme] Authorization scheme, `Bearer` by default.
 * @returns {(method: string, path: string, body?: unknown) => Promise<any>}
 */
export function createJsonClient({
  baseUrl,
  token,
  fetchImpl = fetch,
  scheme = 'Bearer',
}) {
  return async function request(method, path, body) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `${scheme} ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }

    if (!response.ok) {
      const detail =
        [data?.error?.message, data?.message, data?.error]
          .concat(data?.error?.code)
          .find((value) => typeof value === 'string' && value) ??
        'response body omitted';
      const error = new Error(
        `${method} ${path} -> ${response.status}: ${detail}`,
      );
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }

    return data;
  };
}

/**
 * Generates a random secret.
 *
 * @returns {string} 64 lowercase hex characters from 32 random bytes.
 */
export function randomSecret() {
  return randomBytes(32).toString('hex');
}

/**
 * Collects provisioning steps and renders them as aligned text lines.
 * Callers pass step names and details only, never secret values.
 *
 * @returns {{
 *   add: (step: string, outcome: 'created' | 'exists' | 'updated' | 'skipped' | 'manual', detail?: string) => void,
 *   lines: () => string[],
 *   print: () => void,
 * }}
 */
export function createChecklist() {
  const entries = [];
  return {
    add(step, outcome, detail = '') {
      entries.push({ step, outcome, detail });
    },
    lines() {
      const stepWidth = Math.max(0, ...entries.map((e) => e.step.length));
      const outcomeWidth = Math.max(0, ...entries.map((e) => e.outcome.length));
      return entries.map(({ step, outcome, detail }) =>
        `${step.padEnd(stepWidth)}  ${outcome.padEnd(outcomeWidth)}  ${detail}`.trimEnd(),
      );
    },
    print() {
      for (const line of this.lines()) console.log(line);
    },
  };
}

/**
 * Throws when any secret longer than 8 characters appears in `text`.
 * The error never includes the secret itself.
 *
 * @param {string} text Output about to be logged or written.
 * @param {string[]} secrets Secret values to look for.
 */
export function assertNoSecrets(text, secrets) {
  for (const secret of secrets) {
    if (
      typeof secret === 'string' &&
      secret.length > 8 &&
      text.includes(secret)
    ) {
      throw new Error('Refusing to emit output that contains a secret value.');
    }
  }
}

/**
 * Loads an env file into `process.env`, warning (by key name only) about
 * keys already set, since those keep their existing values.
 *
 * @param {string} path Path to a dotenv file.
 */
export function loadEnvFile(path) {
  const contents = readFileSync(path, 'utf8');
  const overridden = [...contents.matchAll(/^([A-Z0-9_]+)=/gm)]
    .map((match) => match[1])
    .filter((key) => key in process.env);
  if (overridden.length > 0) {
    console.warn(
      `Warning: ${overridden.join(', ')} already set in the environment; values from ${path} are ignored for them.`,
    );
  }
  process.loadEnvFile(path);
}
