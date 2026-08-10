import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PAGES_TARGETS,
  PREVIEW_COMMENT_MARKER,
  previewBranch,
  renderPreviewComment,
  selectPreviewTargets,
  validatePagesTargets,
} from './deployment.mjs';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
const SUPERSEDED_RESULT = Object.freeze({ status: 'superseded' });
const NO_TARGETS_RESULT = Object.freeze({ status: 'no-targets' });
const PRODUCTION_STATUS_LABELS = Object.freeze({
  success: 'Ready',
  'build-failed': 'Build failed',
  'deployment-skipped': 'Deployment skipped',
  'deploy-failed': 'Deployment failed',
});
const GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_GITHUB_REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const RUNTIME_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CI',
  'LANG',
  'LC_ALL',
  'TZ',
  'TERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'NODE_OPTIONS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]);
const SAFE_NX_ENVIRONMENT_KEYS = Object.freeze([
  'NX_DAEMON',
  'NX_PARALLEL',
  'NX_TASKS_RUNNER_DYNAMIC_OUTPUT',
  'NX_VERBOSE_LOGGING',
]);
const SAFE_NPM_CONFIG_ENVIRONMENT_KEYS = Object.freeze([
  'NPM_CONFIG_AUDIT',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_CAFILE',
  'NPM_CONFIG_COLOR',
  'NPM_CONFIG_FUND',
  'NPM_CONFIG_LOGLEVEL',
  'NPM_CONFIG_OFFLINE',
  'NPM_CONFIG_PREFER_OFFLINE',
  'NPM_CONFIG_PROGRESS',
  'NPM_CONFIG_REGISTRY',
  'NPM_CONFIG_STRICT_SSL',
  'npm_config_audit',
  'npm_config_cache',
  'npm_config_cafile',
  'npm_config_color',
  'npm_config_fund',
  'npm_config_loglevel',
  'npm_config_offline',
  'npm_config_prefer_offline',
  'npm_config_progress',
  'npm_config_registry',
  'npm_config_strict_ssl',
]);

function validateCommitSha(name, sha) {
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    throw new TypeError(`${name} SHA must be 7-64 hexadecimal characters.`);
  }
}

function freezeResults(results) {
  return Object.freeze(results.map((result) => Object.freeze(result)));
}

function renderSummary(body) {
  return `## Cloudflare previews\n\n${body}`;
}

function createFailureError(environment, failures) {
  const details = failures
    .map(
      ({ target, operation, error }) =>
        `${target.displayName} ${operation}: ${error}`,
    )
    .join('; ');

  return new Error(`Cloudflare ${environment} deployment failed: ${details}`);
}

function throwCollectedErrors(errors, message) {
  if (errors.length === 0) {
    return;
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  throw new AggregateError(errors, message);
}

function renderProductionSummary(results, targets) {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const rows = results.map((result) => {
    const target = targetById.get(result.targetId);

    return `| ${target.displayName} | ${PRODUCTION_STATUS_LABELS[result.status]} |`;
  });

  return [
    '## Cloudflare production',
    '',
    '| Site | Status |',
    '| --- | --- |',
    ...rows,
  ].join('\n');
}

function processFailure(command, args, detail) {
  return Object.freeze({
    ok: false,
    error: `${command} ${args.join(' ')}: ${detail}`,
  });
}

function assertProcessSucceeded(result, label) {
  if (!result.ok) {
    throw new Error(`${label}: ${result.error}`);
  }

  return result;
}

function validateNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function validateCliSha(name, value) {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/i.test(value)) {
    throw new TypeError(`${name} must contain hexadecimal characters only.`);
  }
}

function validatePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function validateGitHubRepository(repository) {
  if (typeof repository !== 'string') {
    throw new TypeError('GitHub repository must use safe owner/name segments.');
  }

  const segments = repository.split('/');
  const [owner, name] = segments;

  if (
    segments.length !== 2 ||
    !GITHUB_OWNER_PATTERN.test(owner) ||
    !GITHUB_REPOSITORY_PATTERN.test(name) ||
    name === '.' ||
    name === '..'
  ) {
    throw new TypeError('GitHub repository must use safe owner/name segments.');
  }
}

function selectRuntimeEnvironment(env) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(env).filter(([key, value]) => {
        if (typeof value !== 'string') {
          return false;
        }

        if (RUNTIME_ENVIRONMENT_KEYS.includes(key) || key.startsWith('VITE_')) {
          return true;
        }

        return (
          SAFE_NX_ENVIRONMENT_KEYS.includes(key) ||
          SAFE_NPM_CONFIG_ENVIRONMENT_KEYS.includes(key)
        );
      }),
    ),
  );
}

/** Formats nested deployment failures for readable command-line diagnostics. */
export function formatCliError(error) {
  const lines = [];
  const seen = new Set();
  const visit = (value, depth) => {
    const prefix = depth === 0 ? '' : `${'  '.repeat(depth)}- `;

    if (value instanceof AggregateError && seen.has(value)) {
      lines.push(`${prefix}[Circular aggregate error]`);
      return;
    }

    const message = value instanceof Error ? value.message : String(value);
    lines.push(`${prefix}${message}`);

    if (value instanceof AggregateError) {
      seen.add(value);

      for (const nestedError of value.errors) {
        visit(nestedError, depth + 1);
      }
    }
  };

  visit(error, 0);

  return lines.join('\n');
}

/** Builds, deploys, and reports affected pull request previews. */
export async function runPreviewDeployment(
  { baseSha, headSha, prNumber, targets = PAGES_TARGETS },
  dependencies,
) {
  validatePagesTargets(targets);
  validateCommitSha('Base', baseSha);
  validateCommitSha('Head', headSha);
  const branch = previewBranch(prNumber);

  const currentHeadSha = await dependencies.getPullRequestHead(prNumber);

  if (currentHeadSha !== headSha) {
    return SUPERSEDED_RESULT;
  }

  const range = { baseSha, headSha };
  const affectedProjects = await dependencies.listAffectedProjects(range);
  const changedFiles = await dependencies.listChangedFiles(range);
  const selectedTargets = selectPreviewTargets({
    affectedProjects,
    changedFiles,
    targets,
  });

  if (selectedTargets.length === 0) {
    const latestHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (latestHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    const comment = await dependencies.findPreviewComment(prNumber);
    const mutationHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (mutationHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    if (comment !== null) {
      await dependencies.deletePreviewComment(comment.id);
    }

    return NO_TARGETS_RESULT;
  }

  const results = [];
  const failures = [];

  for (const target of selectedTargets) {
    const buildResult = await dependencies.buildTarget(target);

    if (!buildResult.ok) {
      results.push({ targetId: target.id, status: 'build-failed' });
      failures.push({
        target,
        operation: 'build',
        error: buildResult.error,
      });
      continue;
    }

    const deployResult = await dependencies.deployTarget({
      target,
      branch,
      sha: headSha,
    });

    if (!deployResult.ok) {
      results.push({ targetId: target.id, status: 'deploy-failed' });
      failures.push({
        target,
        operation: 'deploy',
        error: deployResult.error,
      });
      continue;
    }

    results.push({ targetId: target.id, status: 'success' });
  }

  const previewResults = freezeResults(results);
  const body = renderPreviewComment({
    headSha,
    prNumber,
    results: previewResults,
    targets,
  });
  const errors =
    failures.length === 0 ? [] : [createFailureError('preview', failures)];

  try {
    const latestHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (latestHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    const comment = await dependencies.findPreviewComment(prNumber);
    const mutationHeadSha = await dependencies.getPullRequestHead(prNumber);

    if (mutationHeadSha !== headSha) {
      return SUPERSEDED_RESULT;
    }

    if (comment === null) {
      await dependencies.createPreviewComment({ prNumber, body });
    } else {
      await dependencies.updatePreviewComment({ commentId: comment.id, body });
    }
  } catch (error) {
    errors.push(error);
  }

  try {
    await dependencies.appendSummary(renderSummary(body));
  } catch (error) {
    errors.push(error);
  }

  throwCollectedErrors(
    errors,
    'Cloudflare preview deployment and reporting failed.',
  );

  return Object.freeze({ status: 'success', results: previewResults });
}

/** Builds and deploys every production Pages target in manifest order. */
export async function runProductionDeployment(
  { sha, targets = PAGES_TARGETS },
  dependencies,
) {
  validatePagesTargets(targets);
  validateCommitSha('Production', sha);

  const buildResults = [];
  const failures = [];

  for (const target of targets) {
    const buildResult = await dependencies.buildTarget(target);

    if (!buildResult.ok) {
      buildResults.push({ targetId: target.id, status: 'build-failed' });
      failures.push({
        target,
        operation: 'build',
        error: buildResult.error,
      });
      continue;
    }

    buildResults.push({ targetId: target.id, status: 'deployment-skipped' });
  }

  if (failures.length > 0) {
    const productionResults = freezeResults(buildResults);
    const errors = [createFailureError('production', failures)];

    try {
      await dependencies.appendSummary(
        renderProductionSummary(productionResults, targets),
      );
    } catch (error) {
      errors.push(error);
    }

    throwCollectedErrors(
      errors,
      'Cloudflare production deployment and reporting failed.',
    );
  }

  const deploymentResults = [];

  for (const target of targets) {
    const deployResult = await dependencies.deployTarget({
      target,
      branch: 'main',
      sha,
    });

    if (!deployResult.ok) {
      deploymentResults.push({
        targetId: target.id,
        status: 'deploy-failed',
      });
      failures.push({
        target,
        operation: 'deploy',
        error: deployResult.error,
      });
      continue;
    }

    deploymentResults.push({ targetId: target.id, status: 'success' });
  }

  const productionResults = freezeResults(deploymentResults);
  const errors =
    failures.length === 0 ? [] : [createFailureError('production', failures)];

  try {
    await dependencies.appendSummary(
      renderProductionSummary(productionResults, targets),
    );
  } catch (error) {
    errors.push(error);
  }

  throwCollectedErrors(
    errors,
    'Cloudflare production deployment and reporting failed.',
  );

  return Object.freeze({ status: 'success', results: productionResults });
}

/** Parses the strict Cloudflare deployment command-line interface. */
export function parseDeployArgs(argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError('Deployment arguments must be an array.');
  }

  if (
    argv.length === 7 &&
    argv[0] === 'preview' &&
    argv[1] === '--base' &&
    argv[3] === '--head' &&
    argv[5] === '--pr'
  ) {
    validateCliSha('Base SHA', argv[2]);
    validateCliSha('Head SHA', argv[4]);
    const prNumber = Number(argv[6]);
    validatePositiveInteger('PR number', prNumber);

    if (String(prNumber) !== argv[6]) {
      throw new TypeError('PR number must be a positive integer.');
    }

    return Object.freeze({
      mode: 'preview',
      baseSha: argv[2],
      headSha: argv[4],
      prNumber,
    });
  }

  if (argv.length === 3 && argv[0] === 'production' && argv[1] === '--sha') {
    validateCliSha('Production SHA', argv[2]);

    return Object.freeze({ mode: 'production', sha: argv[2] });
  }

  throw new TypeError('Invalid Cloudflare deployment arguments.');
}

/** Returns the argument array for an Nx affected-project query. */
export function nxAffectedArgs({ baseSha, headSha }) {
  validateNonEmptyString('Base SHA', baseSha);
  validateNonEmptyString('Head SHA', headSha);

  return Object.freeze([
    'nx',
    'show',
    'projects',
    '--affected',
    `--base=${baseSha}`,
    `--head=${headSha}`,
    '--withTarget=build',
    '--type=app',
    '--json',
  ]);
}

/** Returns the safe argument array for a Wrangler Pages deployment. */
export function wranglerDeployArgs(target, { branch, sha }) {
  validatePagesTargets([target]);
  validateNonEmptyString('Cloudflare branch', branch);
  validateNonEmptyString('Commit SHA', sha);

  const outputDirectory = target.wranglerConfigDirectory
    ? posix.relative(target.wranglerConfigDirectory, target.outputDirectory)
    : target.outputDirectory;

  if (outputDirectory === '' || outputDirectory.startsWith('-')) {
    throw new TypeError(
      'Wrangler output directory must be a safe positional argument.',
    );
  }

  return Object.freeze([
    '--no-install',
    'wrangler',
    ...(target.wranglerConfigDirectory
      ? [`--cwd=${target.wranglerConfigDirectory}`]
      : []),
    'pages',
    'deploy',
    outputDirectory,
    `--project-name=${target.cloudflareProject}`,
    `--branch=${branch}`,
    `--commit-hash=${sha}`,
    '--commit-dirty=true',
    '--no-bundle',
  ]);
}

/** Creates a spawn-based subprocess runner with normalized result objects. */
export function createSubprocessRunner(
  spawnImpl = spawn,
  {
    killTimeoutMs = 5_000,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = {},
) {
  if (typeof spawnImpl !== 'function') {
    throw new TypeError('spawnImpl must be a function.');
  }

  validatePositiveInteger('Subprocess kill timeout', killTimeoutMs);

  if (
    typeof setTimeoutImpl !== 'function' ||
    typeof clearTimeoutImpl !== 'function'
  ) {
    throw new TypeError('Subprocess timer adapters must be functions.');
  }

  return async function runSubprocess(command, args, options = {}) {
    validateNonEmptyString('Command', command);

    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new TypeError('Command arguments must be an array of strings.');
    }

    return new Promise((resolveResult) => {
      let child;

      try {
        child = spawnImpl(command, args, {
          cwd: options.cwd ?? process.cwd(),
          env: options.env ?? process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolveResult(processFailure(command, args, error.message));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      let streamFailure;
      let killTimer;
      const settle = (result) => {
        if (!settled) {
          settled = true;

          if (killTimer !== undefined) {
            clearTimeoutImpl(killTimer);
          }

          resolveResult(result);
        }
      };
      const terminateAfterStreamFailure = (streamName, error) => {
        if (streamFailure !== undefined) {
          return;
        }

        streamFailure = `${streamName} stream failed: ${error.message}`;

        try {
          child.kill('SIGTERM');
        } catch (killError) {
          streamFailure += `; SIGTERM failed: ${killError.message}`;
        }

        if (settled) {
          return;
        }

        killTimer = setTimeoutImpl(() => {
          try {
            child.kill('SIGKILL');
          } catch (killError) {
            streamFailure += `; SIGKILL failed: ${killError.message}`;
          }
        }, killTimeoutMs);
        killTimer?.unref?.();
      };

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stdout?.on('error', (error) => {
        terminateAfterStreamFailure('stdout', error);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stderr?.on('error', (error) => {
        terminateAfterStreamFailure('stderr', error);
      });
      child.on('error', (error) => {
        if (streamFailure !== undefined) {
          streamFailure += `; process error: ${error.message}`;
          return;
        }

        settle(processFailure(command, args, error.message));
      });
      child.on('close', (code) => {
        if (streamFailure !== undefined) {
          settle(processFailure(command, args, streamFailure));
          return;
        }

        if (code === 0) {
          settle(Object.freeze({ ok: true, stdout, stderr }));
          return;
        }

        const detail =
          stderr.trim() || stdout.trim() || `process exited with code ${code}`;
        settle(processFailure(command, args, detail));
      });
    });
  };
}

/** Creates a minimal GitHub client for preview-head and comment operations. */
export function createGitHubClient({
  fetchImpl,
  token,
  repository,
  requestTimeoutMs = DEFAULT_GITHUB_REQUEST_TIMEOUT_MS,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function.');
  }

  validateNonEmptyString('GitHub token', token);
  validateGitHubRepository(repository);
  validatePositiveInteger('GitHub request timeout', requestTimeoutMs);

  const request = async (method, path, body) => {
    const response = await fetchImpl(
      `${GITHUB_API_BASE_URL}/repos/${repository}${path}`,
      {
        method,
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `GitHub ${method} ${path} failed with ${response.status}.`,
      );
    }

    return response;
  };

  return Object.freeze({
    async getPullRequestHead(prNumber) {
      validatePositiveInteger('PR number', prNumber);
      const response = await request('GET', `/pulls/${prNumber}`);
      const payload = await response.json();

      if (
        typeof payload?.head?.sha !== 'string' ||
        !COMMIT_SHA_PATTERN.test(payload.head.sha)
      ) {
        throw new TypeError('Malformed GitHub pull request response.');
      }

      return payload.head.sha;
    },

    async findPreviewComment(prNumber) {
      validatePositiveInteger('PR number', prNumber);
      const seenCommentIds = new Set();
      let page = 1;

      while (true) {
        const path = `/issues/${prNumber}/comments?per_page=100&page=${page}`;
        const response = await request('GET', path);
        const comments = await response.json();

        if (!Array.isArray(comments) || comments.length > 100) {
          throw new TypeError('Malformed GitHub comments response.');
        }

        if (
          comments.some(
            (comment) => !Number.isInteger(comment?.id) || comment.id <= 0,
          )
        ) {
          throw new TypeError(
            'GitHub comments must have positive integer ids.',
          );
        }

        const pageCommentIds = new Set(comments.map((comment) => comment.id));

        if (pageCommentIds.size !== comments.length) {
          throw new TypeError('GitHub comment ids must be unique per page.');
        }

        const newCommentIds = [...pageCommentIds].filter(
          (commentId) => !seenCommentIds.has(commentId),
        );

        if (comments.length > 0 && newCommentIds.length === 0) {
          throw new Error('GitHub comment pagination made no progress.');
        }

        for (const commentId of newCommentIds) {
          seenCommentIds.add(commentId);
        }

        const comment = comments.find(
          (candidate) =>
            candidate?.user?.login === 'github-actions[bot]' &&
            typeof candidate.body === 'string' &&
            candidate.body.includes(PREVIEW_COMMENT_MARKER) &&
            Number.isInteger(candidate.id) &&
            candidate.id > 0,
        );

        if (comment) {
          return Object.freeze({ id: comment.id });
        }

        if (comments.length < 100) {
          return null;
        }

        page += 1;
      }
    },

    async createPreviewComment({ prNumber, body }) {
      validatePositiveInteger('PR number', prNumber);
      validateNonEmptyString('Preview comment body', body);
      await request('POST', `/issues/${prNumber}/comments`, { body });
    },

    async updatePreviewComment({ commentId, body }) {
      validatePositiveInteger('Comment id', commentId);
      validateNonEmptyString('Preview comment body', body);
      await request('PATCH', `/issues/comments/${commentId}`, { body });
    },

    async deletePreviewComment(commentId) {
      validatePositiveInteger('Comment id', commentId);
      await request('DELETE', `/issues/comments/${commentId}`);
    },
  });
}

/** Creates concrete process, GitHub, and Actions-summary deployment adapters. */
export function createRuntimeDependencies({
  spawnImpl = spawn,
  fetchImpl = globalThis.fetch,
  appendFileImpl = appendFile,
  env = process.env,
} = {}) {
  validateNonEmptyString('GITHUB_STEP_SUMMARY', env.GITHUB_STEP_SUMMARY);
  const runSubprocess = createSubprocessRunner(spawnImpl);
  const runtimeEnvironment = selectRuntimeEnvironment(env);
  let github;
  const getGitHub = () => {
    github ??= createGitHubClient({
      fetchImpl,
      token: env.GITHUB_TOKEN,
      repository: env.GITHUB_REPOSITORY,
    });

    return github;
  };

  return Object.freeze({
    async listAffectedProjects(range) {
      const result = assertProcessSucceeded(
        await runSubprocess('npx', nxAffectedArgs(range), {
          env: runtimeEnvironment,
        }),
        'Nx affected projects failed',
      );

      let projects;

      try {
        projects = JSON.parse(result.stdout);
      } catch {
        throw new TypeError('Nx affected projects returned invalid JSON.');
      }

      if (
        !Array.isArray(projects) ||
        projects.some((project) => typeof project !== 'string')
      ) {
        throw new TypeError('Nx affected projects returned invalid JSON.');
      }

      return Object.freeze([...projects]);
    },

    async listChangedFiles({ baseSha, headSha }) {
      validateNonEmptyString('Base SHA', baseSha);
      validateNonEmptyString('Head SHA', headSha);
      const result = assertProcessSucceeded(
        await runSubprocess(
          'git',
          ['diff', '--name-only', `${baseSha}...${headSha}`],
          { env: runtimeEnvironment },
        ),
        'Changed-file lookup failed',
      );
      const files = result.stdout
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);

      return Object.freeze(files);
    },

    buildTarget(target) {
      return runSubprocess(
        'npx',
        ['nx', 'build', target.nxProject, '--configuration=production'],
        { env: runtimeEnvironment },
      );
    },

    async deployTarget({ target, branch, sha }) {
      try {
        validateNonEmptyString(
          'CLOUDFLARE_API_TOKEN',
          env.CLOUDFLARE_API_TOKEN,
        );
        validateNonEmptyString(
          'CLOUDFLARE_ACCOUNT_ID',
          env.CLOUDFLARE_ACCOUNT_ID,
        );
      } catch (error) {
        return Object.freeze({ ok: false, error: error.message });
      }

      const cloudflareEnvironment = Object.freeze({
        ...runtimeEnvironment,
        CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      });

      return runSubprocess('npx', wranglerDeployArgs(target, { branch, sha }), {
        env: cloudflareEnvironment,
      });
    },

    async getPullRequestHead(prNumber) {
      return getGitHub().getPullRequestHead(prNumber);
    },

    async findPreviewComment(prNumber) {
      return getGitHub().findPreviewComment(prNumber);
    },

    async createPreviewComment(comment) {
      return getGitHub().createPreviewComment(comment);
    },

    async updatePreviewComment(comment) {
      return getGitHub().updatePreviewComment(comment);
    },

    async deletePreviewComment(commentId) {
      return getGitHub().deletePreviewComment(commentId);
    },

    appendSummary(summary) {
      validateNonEmptyString('Deployment summary', summary);
      return appendFileImpl(env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
    },
  });
}

/** Parses and executes one Cloudflare deployment CLI command. */
export function executeDeployCommand(argv, dependencies) {
  const command = parseDeployArgs(argv);

  if (command.mode === 'preview') {
    return runPreviewDeployment(command, dependencies);
  }

  return runProductionDeployment(command, dependencies);
}

async function main() {
  try {
    await executeDeployCommand(
      process.argv.slice(2),
      createRuntimeDependencies(),
    );
  } catch (error) {
    console.error(formatCliError(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
