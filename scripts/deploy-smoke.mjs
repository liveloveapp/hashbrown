#!/usr/bin/env node
import { resolve } from 'node:path';

const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 2000;

const defaultSleep = (delayMs) =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs);
  });

export function parseDeploySmokeArgs(argv) {
  const options = {
    url: 'https://hashbrown.dev',
    expectedText: 'Hashbrown',
    name: 'deployment',
    dryRun: false,
    retries: DEFAULT_RETRIES,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--url' && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === '--expect' && argv[index + 1]) {
      options.expectedText = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === '--name' && argv[index + 1]) {
      options.name = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (current === '--retries' && argv[index + 1]) {
      options.retries = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (current === '--retry-delay-ms' && argv[index + 1]) {
      options.retryDelayMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${current}`);
  }

  return options;
}

export async function runDeploySmoke({
  url,
  expectedText,
  name = 'deployment',
  dryRun = false,
  retries = DEFAULT_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchImpl = fetch,
  sleep = defaultSleep,
}) {
  if (dryRun) {
    return `dry-run:${name}:${url}:${expectedText}`;
  }

  let attemptsRemaining = retries + 1;
  let lastError = null;

  while (attemptsRemaining > 0) {
    try {
      const response = await fetchImpl(url);

      if (!response.ok) {
        throw new Error(
          `Deploy smoke failed for ${name} (${url}): ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();
      if (!html.includes(expectedText)) {
        throw new Error(
          `Deploy smoke failed for ${name} (${url}): missing expected text "${expectedText}"`,
        );
      }

      return `pass:${name}:${url}:${expectedText}`;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attemptsRemaining -= 1;

      if (attemptsRemaining === 0) {
        throw lastError;
      }

      await sleep(retryDelayMs);
    }
  }

  throw lastError ?? new Error(`Deploy smoke failed for ${name} (${url})`);
}

if (process.argv[1] === resolve(process.cwd(), 'scripts/deploy-smoke.mjs')) {
  const options = parseDeploySmokeArgs(process.argv.slice(2));

  runDeploySmoke(options)
    .then((result) => {
      process.stdout.write(`${result}\n`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
